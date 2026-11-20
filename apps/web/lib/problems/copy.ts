/**
 * User-facing texts of problem tracking (DASH-16..18, PRB-22), in one pure function. Two gate
 * levels (ENV-05c, PRB-23): `neetCode` is true only when the store has an extension that tracks
 * NeetCode too (`EXTENSION_FEATURES.problemTrackingNeetCode`, 0.3.1). With it false every text is
 * the LeetCode-only text of extension 0.3.0, word for word. The 0.3.1 texts marked "approved" are
 * the product owner's wording of 2026-11-20; the others follow their style (PRB-22).
 */
export interface ProblemsCopy {
  /** The switch label (DASH-16). */
  settingLabel: string;
  /** Title of the Settings section (DASH-16). */
  settingsTitle: string;
  /** The line under the switch (approved at 0.3.1). */
  settingHelp: string;
  /** Shown when no problem site is tracked (approved at 0.3.1). */
  needsSite: string;
  /** DASH-17 */
  cardTitle: string;
  /** DASH-17: names both sites; none at 0.3.0. */
  cardSubtitle: string | null;
  cardEmpty: string;
  cardLoadTemporary: string;
  cardLoadPermanent: string;
  /** DASH-18 */
  announcement: string;
  /** PRB-11: show the site next to the problem name. */
  showSite: boolean;
}

const LEETCODE_ONLY: ProblemsCopy = {
  settingLabel: "Track LeetCode problems",
  settingsTitle: "LeetCode problems",
  settingHelp:
    "Saves the problem name from LeetCode addresses (like two-sum) with your study time. Nothing else from the address.",
  needsSite: "This needs leetcode.com in your tracked sites. Add it above.",
  cardTitle: "LeetCode problems",
  cardSubtitle: null,
  cardEmpty: "No LeetCode problems in this period.",
  cardLoadTemporary:
    "Couldn't load your LeetCode problems. Your tracked time is safe. Try again in a moment.",
  cardLoadPermanent:
    "Couldn't load your LeetCode problems. Trying again won't help yet. Check back later.",
  announcement: "New: see your time per LeetCode problem.",
  showSite: false,
};

const CODING_PROBLEMS: ProblemsCopy = {
  settingLabel: "Track coding problems",
  settingsTitle: "Coding problems",
  settingHelp:
    "Saves the problem name from LeetCode and NeetCode addresses (like two-sum) with your study time. Nothing else from the address.",
  needsSite: "This needs leetcode.com or neetcode.io in your tracked sites. Add one above.",
  cardTitle: "Coding problems",
  cardSubtitle: "Your time per problem on LeetCode and NeetCode.",
  cardEmpty: "No coding problems in this period.",
  cardLoadTemporary:
    "Couldn't load your coding problems. Your tracked time is safe. Try again in a moment.",
  cardLoadPermanent:
    "Couldn't load your coding problems. Trying again won't help yet. Check back later.",
  announcement: "New: see your time per coding problem on LeetCode and NeetCode.",
  showSite: true,
};

export function problemsCopy(neetCode: boolean): ProblemsCopy {
  return neetCode ? CODING_PROBLEMS : LEETCODE_ONLY;
}
