/**
 * Constants mirrored from the approved specs. The spec tables are the source of truth;
 * change a value here only together with its spec (specs/README.md conventions).
 */

/** specs/v0/01-tracking.md §2 */
export const TRACKING = {
  IDLE_THRESHOLD_S: 60,
  MEDIA_IDLE_CEILING_S: 900,
  HEARTBEAT_PERIOD_MIN: 1,
  MAX_INTERVAL_S: 1800,
  MIN_INTERVAL_S: 5,
} as const;

/** specs/v0/03-sync.md §2 */
export const SYNC = {
  SYNC_PERIOD_MIN: 5,
  SYNC_BATCH_MAX: 200,
  BACKOFF_MIN: [1, 2, 4, 8, 16, 30],
  LOCAL_QUEUE_MAX_AGE_D: 30,
  /**
   * SYNC-06a: an ingest call that has not answered by then counts as a network error (well
   * under the 30 s after which Chrome may stop an idle MV3 service worker).
   */
  INGEST_TIMEOUT_S: 20,
  /** SYNC-05a: future-dated rejections retried at most this many times, then quarantined. */
  CLOCK_RETRY_MAX: 3,
  /**
   * SYNC-02b: how long Disconnect waits for a running cycle before its final sync; still
   * running then → SYNC_IN_PROGRESS (AUTH-12b).
   */
  DISCONNECT_WAIT_S: 30,
  /**
   * SYNC-05a: slack subtracted from the server's time when classifying a rejection as "ended in
   * the future" (the Date header has whole seconds; the server compared at its own `now()`).
   */
  CLOCK_SLACK_S: 5,
  /** SYNC-05a: a deferred interval is retried at the latest this long after it was deferred. */
  DEFERRED_RETRY_CAP_MIN: 30,
} as const;

/** specs/v0/02-auth.md (AUTH-10b, AUTH-10c) */
export const AUTH = {
  /**
   * AUTH-10b: a token refresh that has not answered by then counts as a temporary failure
   * ("unavailable"); the session is kept.
   */
  REFRESH_TIMEOUT_S: 15,
  /**
   * AUTH-10c: how long a caller waits for the extension's auth lock before giving up with a
   * temporary failure (longer than a refresh plus a bounded revoke plus one ingest call).
   */
  LOCK_TIMEOUT_S: 45,
} as const;

/**
 * specs/v1/02-entitlements.md §2. The database is the authority at run time (ADR-0012); these
 * values feed static copy (landing page) and tests, and a parity test keeps them equal to the
 * last migration that sets the `free` row (ENT-11).
 */
export const ENTITLEMENTS = {
  PLAN_FREE: "free",
  /** Same value as DATA-01. */
  FREE_MAX_TRACKED_DOMAINS: 12,
  /** ENT-05: stable code in the error details and in the dashboard API. */
  LIMIT_ERROR_CODE: "LIMIT_REACHED",
  /** ENT-06: the spec ID of the limit; released extensions map this hint to LIMIT_REACHED. */
  LIMIT_ERROR_HINT: "DATA-01",
} as const;

/**
 * specs/v1/01-problems.md §2 (PRB-05, PRB-11). The database repeats the domain, the slug pattern
 * and the length in study_session_problems and ingest v2; db-parity.test.ts keeps them equal.
 */
export const PROBLEMS = {
  PROBLEM_DOMAIN: "leetcode.com",
  /** PRB-18: every site whose tabs can carry a problem (#233). PROBLEM_DOMAIN goes in NC-b. */
  PROBLEM_DOMAINS: ["leetcode.com", "neetcode.io"],
  PROBLEM_PATH_PREFIX: "/problems/",
  PROBLEM_SLUG_PATTERN: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  PROBLEM_SLUG_MAX: 100,
  PROBLEM_LIST_MAX: 200,
} as const;

/** specs/v0/04-data-model.md */
export const DATA = {
  /** DATA-01 (kept for existing callers; the value now lives in ENTITLEMENTS, ENT-01). */
  MAX_TRACKED_DOMAINS: ENTITLEMENTS.FREE_MAX_TRACKED_DOMAINS,
  /** DATA-02: server accepts up to MAX_INTERVAL_S + this tolerance. */
  INTERVAL_TOLERANCE_S: 30,
  /** DATA-07: the server accepts `ended_at` up to this far ahead of its own clock. */
  FUTURE_TOLERANCE_S: 300,
  /** Hostname length limit (DNS), used by the `domain` CHECK. */
  MAX_DOMAIN_LENGTH: 253,
} as const;

/** AUTH-07a: version of the dashboard ↔ extension message protocol. */
export const PROTOCOL_VERSION = 1;
