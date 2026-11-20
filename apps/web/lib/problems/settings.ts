/**
 * The "Track coding problems" setting (LeetCode problems before 0.3.1, see ./copy) in the dashboard (DASH-16, PRB-02, PRB-16): the API
 * contract shared by the route and the browser, the decision of when to ask before turning it
 * off, and the messages. Pure.
 */
import { PROBLEMS, SYNC } from "@careeros/shared";
import { z } from "zod";

/** PUT /api/settings/problems. `deleteHistory: true` only makes sense when turning it off. */
export const ProblemSettingRequestSchema = z
  .object({ enabled: z.boolean(), deleteHistory: z.boolean().optional() })
  .strict()
  .refine((body) => !(body.enabled && body.deleteHistory === true));
export type ProblemSettingRequest = z.infer<typeof ProblemSettingRequestSchema>;

export const ProblemSettingReplySchema = z.object({ enabled: z.boolean() }).strict();

/** What the switch does when the user flips it (PRB-16). */
export type SwitchAction = "turn-on" | "ask" | "turn-off";

/** Turning off asks first only when the account has stored slugs; turning on never asks. */
export function switchAction(enabled: boolean, hasStoredProblems: boolean): SwitchAction {
  if (!enabled) return "turn-on";
  return hasStoredProblems ? "ask" : "turn-off";
}

/**
 * PRB-16, DASH-17: the problems card is shown only while the setting is on. The rows come from
 * the stored slugs whatever the setting says, so after "keep history" they are back as they were
 * when it is turned on again.
 */
export function showProblemsCard(setting: "on" | "off" | "unknown"): boolean {
  return setting === "on";
}

/** PRB-03: the extension reads the setting with each tracked-site refresh. */
export const EXTENSION_FOLLOWS_NOTE = `The extension updates within about ${SYNC.SYNC_PERIOD_MIN} minutes.`;

/**
 * DASH-16 (PRB-05): the setting needs a problem site itself in the tracked sites. From extension
 * 0.3.1 (`neetCode`) any of PROBLEM_DOMAINS counts; before that only leetcode.com. Exact element
 * equality, never a substring test on a domain or URL.
 */
export function isProblemDomainTracked(domains: readonly string[], neetCode = false): boolean {
  const wanted: readonly string[] = neetCode ? PROBLEMS.PROBLEM_DOMAINS : ["leetcode.com"];
  return domains.some((domain) => wanted.some((site) => site === domain));
}

export function problemSettingErrorMessage(code: string | undefined, status: number | null) {
  if (status === null) return "Couldn't reach CareerOS. Check your connection and try again.";
  if (code === "NOT_AUTHENTICATED") return "Your session ended. Sign in again.";
  return "Couldn't save this setting. Try again in a moment.";
}
