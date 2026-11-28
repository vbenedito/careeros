/**
 * Tracked-domain sync (SYNC-09..11), and the account's problem setting read with it (SYNC-09d). The server list is the source of truth; the worker keeps a
 * cached copy (read by the tracking engine and the popup). Edits go to the server first and
 * the cache changes only after the server accepted them (no offline edits in v0).
 */
import { isValidDomain, parseDomainInput, parseProblemRules } from "@careeros/shared";
import type { AccountEpoch } from "../account-epoch";
import type { KeyValueArea } from "../auth/storage";
import { DOMAINS_CACHE_KEY } from "../tracking/keys";

/** Server calls (implemented with supabase-js in supabase-domains.ts). */
export interface DomainsApi {
  list(): Promise<string[]>;
  /** Adds a domain; an existing one is not an error. */
  insert(domain: string): Promise<void>;
  delete(domain: string): Promise<void>;
  /** SYNC-09d, DATA-13: the caller's `track_problems`; false when there is no row. */
  trackProblems(): Promise<boolean>;
  /** PSR-19: the caller's active problem rules, as the server sent them (validated by the service). */
  problemRules(): Promise<unknown[]>;
}

/** Errors the API reports in a way the service can act on. */
export class DomainsApiError extends Error {
  constructor(
    readonly code: "UNAUTHORIZED" | "LIMIT_REACHED" | "UNAVAILABLE",
    /** ENT-07: the limit from the error details; absent when the server sent none. */
    readonly limit?: number,
  ) {
    super(code);
    this.name = "DomainsApiError";
  }
}

export type DomainsError = "NOT_CONNECTED" | "INVALID_DOMAIN" | "LIMIT_REACHED" | "UNAVAILABLE";
export type DomainsResult =
  | { ok: true; domains: string[] }
  /** `limit` (ENT-07, ENT-09): the number from the server's limit error, when it sent one. */
  | { ok: false; error: DomainsError; limit?: number };

export function createDomainService(deps: {
  api: DomainsApi;
  storage: KeyValueArea;
  isConnected: () => Promise<boolean>;
  /** AUTH-11: the server rejected the session. */
  sessionRejected: () => Promise<void>;
  now: () => number;
  /** #113: a list fetched before a change of account is not cached. */
  epoch?: AccountEpoch;
}) {
  const { api, storage } = deps;

  async function guard(task: () => Promise<DomainsResult>): Promise<DomainsResult> {
    if (!(await deps.isConnected())) return { ok: false, error: "NOT_CONNECTED" };
    try {
      return await task();
    } catch (error) {
      const code = error instanceof DomainsApiError ? error.code : "UNAVAILABLE";
      if (code === "UNAUTHORIZED") {
        await deps.sessionRejected();
        return { ok: false, error: "NOT_CONNECTED" };
      }
      const limit = error instanceof DomainsApiError ? error.limit : undefined;
      return limit === undefined ? { ok: false, error: code } : { ok: false, error: code, limit };
    }
  }

  async function cachedDomains(): Promise<string[] | null> {
    const cache = (await storage.get(DOMAINS_CACHE_KEY))[DOMAINS_CACHE_KEY] as
      | { domains?: unknown }
      | undefined;
    return Array.isArray(cache?.domains)
      ? cache.domains.filter((d): d is string => typeof d === "string")
      : null;
  }

  async function cachedProblemRules(): Promise<unknown> {
    const cache = (await storage.get(DOMAINS_CACHE_KEY))[DOMAINS_CACHE_KEY] as
      | { problemRules?: unknown }
      | undefined;
    return cache?.problemRules;
  }

  async function refreshCache(): Promise<DomainsResult> {
    // #113: validate the server's list like any external input (a bad row such as "com" would
    // match every .com site in the popup).
    const started = deps.epoch?.current();
    // SYNC-09d, PRB-04: the setting is read with every refresh; a failed read means off and
    // never fails the refresh or blocks writing the list.
    const setting = api.trackProblems().then(
      (on) => on === true,
      () => false,
    );
    // PSR-19: the rules are read with the list; a failed read never fails the refresh, and keeps
    // the last good cached rules (or none).
    const rules = api.problemRules().then(
      (rows) => parseProblemRules(rows),
      () => null,
    );
    const domains = [...(await api.list())].filter(isValidDomain).sort();
    const trackProblems = await setting;
    const read = await rules;
    // Read before the checks below: a sign-out in the gap must not let old rules be written back.
    const previous = read === null ? await cachedProblemRules() : null;
    if (deps.epoch && deps.epoch.current() !== started)
      return { ok: false, error: "NOT_CONNECTED" };
    // SYNC-09b (#65): a Disconnect may have finished while the list was in flight (it clears
    // the cache): never write the old list back for an account that is gone.
    if (!(await deps.isConnected())) return { ok: false, error: "NOT_CONNECTED" };
    const problemRules = read ?? parseProblemRules(previous);
    await storage.set({
      [DOMAINS_CACHE_KEY]: { domains, trackProblems, problemRules, fetchedAt: deps.now() },
    });
    return { ok: true, domains };
  }

  return {
    /** SYNC-09: fetch the server list and replace the cache. */
    refresh: () => guard(refreshCache),

    /** SYNC-10: validate, write to the server, then refresh the cache. */
    add(input: string): Promise<DomainsResult> {
      const parsed = parseDomainInput(input);
      if (!parsed.ok) return Promise.resolve({ ok: false, error: "INVALID_DOMAIN" });
      return guard(async () => {
        // SYNC-10a (#54): adding a site that is already tracked is a no-op, also at the limit
        // (the server checks the limit before it finds the duplicate).
        if (!(await cachedDomains())?.includes(parsed.domain)) {
          try {
            await api.insert(parsed.domain);
          } catch (error) {
            const limit = error instanceof DomainsApiError && error.code === "LIMIT_REACHED";
            if (!limit || !(await api.list()).includes(parsed.domain)) throw error;
          }
        }
        return refreshCache();
      });
    },

    /** SYNC-10/11: stops future tracking on it; history stays on the server. */
    remove(domain: string): Promise<DomainsResult> {
      return guard(async () => {
        await api.delete(domain);
        return refreshCache();
      });
    },
  };
}

export type DomainService = ReturnType<typeof createDomainService>;
