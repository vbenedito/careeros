/**
 * Engine A — eligibility & activity (specs/v0/01-tracking.md TRK-01..07, TRK-16).
 *
 * Pure: no Chrome APIs, no clock. The adapter (#16) translates Chrome events into `SignalEvent`s;
 * this module folds them into `Signals` and answers one question: which tracked domain, if any,
 * is being studied right now (`trackingTarget`). Intervals are built on top of that (#15).
 *
 * Privacy (TRK-02, SEC-02): events carry the tab URL only transiently. `Signals` keeps the
 * matched *tracked* domain, never the URL or the hostname of a non-tracked site, so it is safe to
 * persist.
 */
import { hostnameFromUrl, matchTrackedDomain } from "@careeros/shared";

/** `chrome.idle` states. */
export type IdleState = "active" | "idle" | "locked";

/** The active tab of the focused window, as reported by the adapter. */
export interface TabSnapshot {
  /** Read only to derive the hostname; never stored. */
  url: string | undefined;
  audible: boolean;
}

export interface Signals {
  /** TRK-01: the extension holds a session (spec 02). */
  connected: boolean;
  /** TRK-01: tracking enabled on this device (popup setting). */
  trackingEnabled: boolean;
  /** TRK-01: the tracked-domain list; null until it has been loaded. */
  trackedDomains: readonly string[] | null;
  /** TRK-02..04: tracked domain of the active tab of the focused window; null otherwise. */
  focusedDomain: string | null;
  /** Whether that tab is playing audio (TRK-06). */
  audible: boolean;
  /** TRK-05: last `chrome.idle` state (detection interval IDLE_THRESHOLD_S). */
  idle: IdleState;
  /**
   * TRK-06: tracking continues through an `idle` state because the tab was audible when the
   * user went idle. Cleared by audio stopping, the media ceiling, locking or any break in
   * eligibility; only input (`idle: active`) can resume tracking after that.
   */
  mediaHold: boolean;
}

export type SignalEvent =
  | { type: "AUTH"; connected: boolean }
  | { type: "SETTINGS"; trackingEnabled: boolean }
  | { type: "DOMAINS"; domains: readonly string[] }
  /** Active tab of the focused window changed (or its URL/audible did); null = no focused window. */
  | { type: "TAB"; tab: TabSnapshot | null }
  | { type: "IDLE"; state: IdleState }
  /**
   * TRK-13: periodic re-evaluation. `idle` is `queryState(IDLE_THRESHOLD_S)`; `mediaIdle` is
   * `queryState(MEDIA_IDLE_CEILING_S)` (TRK-06 ceiling).
   */
  | { type: "HEARTBEAT"; tab: TabSnapshot | null; idle: IdleState; mediaIdle: IdleState };

export type SignalEffect =
  /** The tracked-domain list changed: the adapter must send a fresh TAB event. */
  { type: "REQUERY_TAB" };

export const INITIAL_SIGNALS: Signals = {
  connected: false,
  trackingEnabled: true,
  trackedDomains: null,
  focusedDomain: null,
  audible: false,
  idle: "active",
  mediaHold: false,
};

/** TRK-02/03: the tracked domain a tab belongs to, or null (non-http(s), untracked, no list). */
export function domainOfTab(
  tab: TabSnapshot | null,
  trackedDomains: readonly string[] | null,
): string | null {
  if (!tab || !trackedDomains) return null;
  const hostname = hostnameFromUrl(tab.url);
  return hostname ? matchTrackedDomain(hostname, trackedDomains) : null;
}

/** TRK-01 (minus activity): every condition except the user being active. */
function eligibleDomain(s: Signals): string | null {
  return s.connected && s.trackingEnabled && s.trackedDomains ? s.focusedDomain : null;
}

/** TRK-05/06: the user counts as active. */
function isActive(s: Signals): boolean {
  return s.idle === "active" || (s.idle === "idle" && s.mediaHold);
}

/** TRK-01..07: the tracked domain being studied right now, or null when tracking is paused. */
export function trackingTarget(s: Signals): string | null {
  const domain = eligibleDomain(s);
  return domain && isActive(s) ? domain : null;
}

function withTab(s: Signals, tab: TabSnapshot | null): Signals {
  const focusedDomain = domainOfTab(tab, s.trackedDomains);
  return { ...s, focusedDomain, audible: focusedDomain !== null && (tab?.audible ?? false) };
}

function withIdle(before: Signals, s: Signals, idle: IdleState): Signals {
  if (idle === before.idle) return s;
  // TRK-06: going idle keeps tracking only if we were tracking an audible tab at that moment.
  const mediaHold =
    idle === "idle" && before.idle === "active" && trackingTarget(before) !== null && s.audible;
  return { ...s, idle, mediaHold };
}

/**
 * TRK-06 invariant: the media hold survives only while the same tracked tab stays audible and
 * eligible. Once lost it is never regained without input.
 */
function settleMediaHold(before: Signals, s: Signals): Signals {
  if (!s.mediaHold) return s;
  const keep =
    s.idle === "idle" &&
    s.audible &&
    eligibleDomain(s) !== null &&
    (before.mediaHold ? s.focusedDomain === before.focusedDomain : true);
  return keep ? s : { ...s, mediaHold: false };
}

/** Folds one event into the signals. Pure. */
export function reduceSignals(
  before: Signals,
  event: SignalEvent,
): { signals: Signals; effects: SignalEffect[] } {
  let s: Signals = before;
  const effects: SignalEffect[] = [];

  switch (event.type) {
    case "AUTH":
      s = { ...s, connected: event.connected };
      break;
    case "SETTINGS":
      s = { ...s, trackingEnabled: event.trackingEnabled };
      break;
    case "DOMAINS": {
      const trackedDomains = [...event.domains];
      // The stored domain cannot be re-matched (the URL is not kept): drop it if it is no longer
      // tracked and ask the adapter for the current tab, which may match a newly added domain.
      const focusedDomain =
        s.focusedDomain && trackedDomains.includes(s.focusedDomain) ? s.focusedDomain : null;
      s = { ...s, trackedDomains, focusedDomain, audible: focusedDomain ? s.audible : false };
      effects.push({ type: "REQUERY_TAB" });
      break;
    }
    case "TAB":
      s = withTab(s, event.tab);
      break;
    case "IDLE":
      s = withIdle(before, s, event.state);
      break;
    case "HEARTBEAT":
      s = withIdle(before, withTab(s, event.tab), event.idle);
      // TRK-06 ceiling: no input for MEDIA_IDLE_CEILING_S ends the media exception.
      if (event.mediaIdle !== "active") s = { ...s, mediaHold: false };
      break;
  }

  return { signals: settleMediaHold(before, s), effects };
}
