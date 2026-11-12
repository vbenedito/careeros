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

/** specs/v0/04-data-model.md */
export const DATA = {
  /** DATA-01 */
  MAX_TRACKED_DOMAINS: 12,
  /** DATA-02: server accepts up to MAX_INTERVAL_S + this tolerance. */
  INTERVAL_TOLERANCE_S: 30,
  /** DATA-07: the server accepts `ended_at` up to this far ahead of its own clock. */
  FUTURE_TOLERANCE_S: 300,
  /** Hostname length limit (DNS), used by the `domain` CHECK. */
  MAX_DOMAIN_LENGTH: 253,
} as const;

/** AUTH-07a: version of the dashboard ↔ extension message protocol. */
export const PROTOCOL_VERSION = 1;
