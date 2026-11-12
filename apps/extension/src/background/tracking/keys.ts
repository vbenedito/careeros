/** chrome.storage.local keys of the tracking module (ADR-0002). */

/** Persisted engine state (TRK-12). */
export const ENGINE_STATE_KEY = "careeros.tracking.engine";
/** Closed intervals waiting for upload (SYNC-01; managed further in #17/#18). */
export const OUTBOX_KEY = "careeros.tracking.outbox";
/** Per-device tracking switch (EXT-UI-06). Missing means on (the default). */
export const TRACKING_ENABLED_KEY = "careeros.settings.trackingEnabled";
/** Cached tracked-domain list (SYNC-09; filled by domain sync, #19). Missing means not loaded. */
export const DOMAINS_CACHE_KEY = "careeros.domains.cache";
/**
 * Random id of this browser profile's extension install (TRK-10 device_id). Kept across
 * restarts; replaced whenever local data is cleared (disconnect, account change, Forget local
 * data — #113), so it never links two accounts' data.
 */
export const DEVICE_ID_KEY = "careeros.device.id";
/**
 * SYNC-05a (#58, #83): intervals the server rejected only because they ended in the future by
 * its clock (device clock ahead, DATA-07). Retried once their end has passed on the server.
 */
export const DEFERRED_KEY = "careeros.tracking.deferred";
/** Intervals the server rejected (SYNC-05): kept, never retried, counted in the popup. */
export const QUARANTINE_KEY = "careeros.tracking.quarantine";
/** Intervals of today already confirmed by the server (SYNC-08), for the popup's totals. */
export const SYNCED_TODAY_KEY = "careeros.tracking.syncedToday";
/** Number of intervals dropped because they were too old to sync (SYNC-07). */
export const DROPPED_COUNT_KEY = "careeros.tracking.droppedCount";
