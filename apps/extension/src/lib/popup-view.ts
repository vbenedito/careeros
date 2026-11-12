/**
 * The popup's main view as a pure function of what is in storage (EXT-UI-01..05, SYNC-12).
 * The popup only renders this; every rule lives here and is unit-tested.
 */
import { hostnameFromUrl, type Interval, matchTrackedDomain } from "@careeros/shared";
import type { EngineState } from "../engine/engine";
import { isSyncing, type SyncState } from "./sync-state";

export interface PopupInput {
  /** Epoch ms. */
  now: number;
  /** Epoch ms of the local midnight that starts today. */
  startOfToday: number;
  auth: { connected: boolean; email: string | null };
  trackingEnabled: boolean;
  trackedDomains: readonly string[] | null;
  engine: EngineState;
  /** This device's intervals of today: synced + pending (SYNC-12). */
  todayIntervals: readonly Interval[];
  sync: SyncState;
  /**
   * `pending` includes `deferred`: intervals waiting for the server's clock (SYNC-05a), which
   * are still uploaded later.
   */
  counts: { pending: number; quarantined: number; deferred?: number };
  /** URL of the active tab, read only to show/offer its hostname (never stored). */
  activeTabUrl: string | undefined;
}

export type PopupStatus =
  | { kind: "tracking"; domain: string }
  | { kind: "idle"; domain: string }
  | { kind: "untracked"; addHost: string | null }
  | { kind: "no-sites"; addHost: string | null }
  /** Connected but the site list has not been loaded yet (first open after connecting). */
  | { kind: "loading-sites" }
  | { kind: "disabled" }
  | { kind: "disconnected" };

export interface DomainTime {
  domain: string;
  seconds: number;
  /** Domain time ÷ today's total (shared bar scale). */
  share: number;
}

export interface PopupView {
  status: PopupStatus;
  todaySeconds: number;
  current: { domain: string; seconds: number } | null;
  top: DomainTime[];
  syncLabel: string;
  quarantined: number;
  /** SYNC-02c (#58): a cycle is uploading now (footer "Syncing…"). */
  syncing: boolean;
  /**
   * SYNC-05a (#58): whole minutes this device's clock is ahead of the server's while that makes
   * the server reject intervals; null otherwise or under `CLOCK_HINT_MIN_MINUTES` (no hint).
   */
  clockAheadMinutes: number | null;
  /** SYNC-05a: of `pending`, how many wait for the server's clock to pass their end. */
  deferred: number;
}

const ms = (iso: string) => Date.parse(iso);

export function buildPopupView(input: PopupInput): PopupView {
  const { now, startOfToday, engine } = input;
  const open = engine.open;

  // SYNC-12: closed intervals of today + the open interval, clipped to today.
  const perDomain = new Map<string, number>();
  const add = (domain: string, from: number, to: number) => {
    const seconds = Math.max(0, (Math.min(to, now) - Math.max(from, startOfToday)) / 1000);
    perDomain.set(domain, (perDomain.get(domain) ?? 0) + seconds);
  };
  for (const i of input.todayIntervals) add(i.domain, ms(i.started_at), ms(i.ended_at));
  if (open) add(open.domain, open.startedAt * 1000, now);
  const todaySeconds = [...perDomain.values()].reduce((a, b) => a + b, 0);

  const top = [...perDomain.entries()]
    .filter(([, s]) => s >= 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([domain, seconds]) => ({
      domain,
      seconds,
      share: todaySeconds > 0 ? seconds / todaySeconds : 0,
    }));

  return {
    status: statusOf(input),
    todaySeconds,
    current: open ? { domain: open.domain, seconds: currentRunSeconds(input) } : null,
    top,
    syncLabel: syncLabel(input),
    quarantined: input.counts.quarantined,
    syncing: input.auth.connected && isSyncing(input.sync, now),
    clockAheadMinutes: clockAheadMinutes(input),
    deferred: input.counts.deferred ?? 0,
  };
}

/** EXT-UI clock hint (#58): shown from 5 minutes ahead, the server's limit (DATA-07). */
export const CLOCK_HINT_MIN_MINUTES = 5;

function clockAheadMinutes(input: PopupInput): number | null {
  const ahead = input.sync.clockAheadMs;
  if (!input.auth.connected || ahead === null) return null;
  const minutes = Math.round(ahead / 60_000);
  return minutes >= CLOCK_HINT_MIN_MINUTES ? minutes : null;
}

/** The current run: the open interval plus the contiguous intervals before it (30-min splits). */
function currentRunSeconds(input: PopupInput): number {
  const open = input.engine.open;
  if (!open) return 0;
  let start = open.startedAt * 1000;
  for (;;) {
    const previous = input.todayIntervals.find(
      (i) => i.domain === open.domain && ms(i.ended_at) === start,
    );
    if (!previous) break;
    start = ms(previous.started_at);
  }
  return Math.max(0, (input.now - Math.max(start, input.startOfToday)) / 1000);
}

function statusOf(input: PopupInput): PopupStatus {
  if (!input.auth.connected) return { kind: "disconnected" };
  if (!input.trackingEnabled) return { kind: "disabled" };
  // EXT-UI-05: only http(s) pages, normalized hostname (www. stripped).
  const host = hostnameFromUrl(input.activeTabUrl);
  if (input.trackedDomains === null) return { kind: "loading-sites" };
  const domains = input.trackedDomains;
  if (domains.length === 0) return { kind: "no-sites", addHost: host };
  if (input.engine.open) return { kind: "tracking", domain: input.engine.open.domain };
  const tracked = host ? matchTrackedDomain(host, domains) : null;
  if (tracked) return { kind: "idle", domain: tracked };
  return { kind: "untracked", addHost: host };
}

function ago(fromMs: number, nowMs: number): string {
  const minutes = Math.floor((nowMs - fromMs) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/** Footer sync states (spec 05 §2). */
function syncLabel(input: PopupInput): string {
  const { sync, now } = input;
  const pending = input.counts.pending;
  if (!input.auth.connected) return pending > 0 ? `${pending} pending` : "Not synced";
  // SYNC-02c (#58, #60): a cycle is uploading now.
  if (isSyncing(sync, now)) return "Syncing…";
  if (pending === 0)
    return sync.lastSyncedAt ? `Synced · ${ago(sync.lastSyncedAt, now)}` : "Not synced yet";
  if (sync.lastOutcome === "error") return `Sync error · ${pending} pending`;
  if (sync.lastOutcome === "offline" || sync.lastOutcome === "abuse") {
    const wait = Math.ceil((sync.notBefore - now) / 60_000);
    return wait > 0 ? `${pending} pending · retrying in ${wait}m` : `Offline · ${pending} pending`;
  }
  return `${pending} pending`;
}
