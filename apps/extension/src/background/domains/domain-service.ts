/**
 * Tracked-domain sync (SYNC-09..11). The server list is the source of truth; the worker keeps a
 * cached copy (read by the tracking engine and the popup). Edits go to the server first and
 * the cache changes only after the server accepted them (no offline edits in v0).
 */
import { isValidDomain, parseDomainInput } from "@careeros/shared";
import type { AccountEpoch } from "../account-epoch";
import type { KeyValueArea } from "../auth/storage";
import { DOMAINS_CACHE_KEY } from "../tracking/keys";

/** Server calls (implemented with supabase-js in supabase-domains.ts). */
export interface DomainsApi {
  list(): Promise<string[]>;
  /** Adds a domain; an existing one is not an error. */
  insert(domain: string): Promise<void>;
  delete(domain: string): Promise<void>;
}

/** Errors the API reports in a way the service can act on. */
export class DomainsApiError extends Error {
  constructor(readonly code: "UNAUTHORIZED" | "LIMIT_REACHED" | "UNAVAILABLE") {
    super(code);
    this.name = "DomainsApiError";
  }
}

export type DomainsError = "NOT_CONNECTED" | "INVALID_DOMAIN" | "LIMIT_REACHED" | "UNAVAILABLE";
export type DomainsResult = { ok: true; domains: string[] } | { ok: false; error: DomainsError };

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
      return { ok: false, error: code };
    }
  }

  async function refreshCache(): Promise<DomainsResult> {
    // #113: validate the server's list like any external input (a bad row such as "com" would
    // match every .com site in the popup).
    const started = deps.epoch?.current();
    const domains = [...(await api.list())].filter(isValidDomain).sort();
    if (deps.epoch && deps.epoch.current() !== started)
      return { ok: false, error: "NOT_CONNECTED" };
    await storage.set({ [DOMAINS_CACHE_KEY]: { domains, fetchedAt: deps.now() } });
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
        await api.insert(parsed.domain);
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
