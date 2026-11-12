import { DATA } from "@careeros/shared";

/** User-facing error messages for worker error codes (docs/design-system.md: say what to do). */
export const ERROR_MESSAGES: Record<string, string> = {
  INVALID_DOMAIN: "That doesn't look like a website address.",
  LIMIT_REACHED: `You can track up to ${DATA.MAX_TRACKED_DOMAINS} sites.`,
  NOT_CONNECTED: "Connect your account first.",
  UNAVAILABLE: "Couldn't reach CareerOS. Try again in a moment.",
  FAILED: "Something went wrong. Try again.",
  CONNECTED: "An account is connected now. Use Disconnect instead.",
  SYNC_IN_PROGRESS: "Still syncing your sessions. Try again in a moment.",
  // EXT-UI-05c (#65): a build without Supabase config (development only).
  NOT_CONFIGURED: "This build can't connect to CareerOS. Use a release build.",
};

export const errorMessage = (code: string): string =>
  ERROR_MESSAGES[code] ?? "Couldn't reach CareerOS. Try again in a moment.";
