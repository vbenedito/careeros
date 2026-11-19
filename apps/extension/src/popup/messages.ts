/** User-facing error messages for worker error codes (docs/design-system.md: say what to do). */
export const ERROR_MESSAGES: Record<string, string> = {
  INVALID_DOMAIN: "That doesn't look like a website address.",
  // ENT-07: without a number from the server's error (an older database), no number.
  LIMIT_REACHED: "You've reached the site limit.",
  NOT_CONNECTED: "Connect your account first.",
  UNAVAILABLE: "Couldn't reach CareerOS. Try again in a moment.",
  FAILED: "Something went wrong. Try again.",
  CONNECTED: "An account is connected now. Use Disconnect instead.",
  SYNC_IN_PROGRESS: "Still syncing your sessions. Try again in a moment.",
  // EXT-UI-05c (#65): a build without Supabase config (development only).
  NOT_CONFIGURED: "This build can't connect to CareerOS. Use a release build.",
};

/**
 * `limit` is the number from the server's limit error (ENT-07, ENT-09). It is never taken from a
 * shared constant at run time.
 */
export const errorMessage = (code: string, limit?: number): string =>
  code === "LIMIT_REACHED" && limit !== undefined
    ? `You can track up to ${limit} sites.`
    : (ERROR_MESSAGES[code] ?? "Couldn't reach CareerOS. Try again in a moment.");
