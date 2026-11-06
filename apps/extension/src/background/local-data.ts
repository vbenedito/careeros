import type { LocalData } from "./auth/auth-service";

/**
 * Placeholder until the local store and sync worker exist (#17, #18): there is no tracked
 * data yet, so nothing is pending and nothing needs clearing. Replaced, not extended, there.
 */
export const noLocalDataYet: LocalData = {
  flush: async () => 0,
  pendingCount: async () => 0,
  clear: async () => {},
};
