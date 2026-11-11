/**
 * Landing page copy (LAND-03). Every claim matches specs/v0; see docs/landing/content.md.
 * Kept as data so the page and its tests share one source.
 */

export const TITLE = "Study Time Tracker for Coding Interviews | CareerOS";
export const DESCRIPTION =
  "A free study time tracker for interview prep: logs your study hours on LeetCode, NeetCode and the sites you choose. Automatic, private, no timers.";

export const STEPS = [
  { t: "Add to Chrome", d: "Install the extension and pick your study sites." },
  {
    t: "The rules",
    d: "Active tab, you at the keyboard: it counts. Idle or another site: it stops.",
  },
  {
    t: "On your computer",
    d: "Each session is saved locally first, so nothing is lost offline.",
  },
  { t: "Sync", d: "Every few minutes, finished sessions upload once, never twice." },
  { t: "Your week", d: "The dashboard adds up every computer you use." },
] as const;

/**
 * Example engine log for "How it works" (LAND-03). Each line is a real rule: TRK-01/03 (counts
 * on a study site), TRK-05 (60 s idle closes the session), SYNC-01/02 (saved locally, uploaded
 * on a later sync cycle: every 5 min when online), TRK-03 (other sites ignored). Sample times only.
 */
export const ENGINE_LOG = [
  { at: "09:20:02", event: "tab leetcode.com", result: "study site, counting", tone: "okc" },
  { at: "09:46:10", event: "no input for 60 s", result: "session closed, 26m", tone: "wc" },
  { at: "09:46:10", event: "saved on this computer", result: "1 waiting to upload", tone: "pc" },
  { at: "09:50:00", event: "sync", result: "1 session confirmed", tone: "okc" },
  { at: "09:51:15", event: "tab youtube.com", result: "not a study site, ignored", tone: "" },
  { at: "09:52:03", event: "tab neetcode.io", result: "study site, counting", tone: "okc" },
] as const;

export const RULES = [
  { v: "60 s", d: "without input and tracking pauses" },
  { v: "15 min", d: "a playing video keeps counting without input" },
  { v: "5 s", d: "shortest session saved; shorter blips are dropped" },
  { v: "50", d: "study sites per account, subdomains included" },
] as const;

export const FAQ = [
  {
    q: "Does CareerOS read the pages I visit?",
    a: "No. It reads the active tab's address only to get the site name (for example leetcode.com) and check whether it is one of your study sites. It never stores or sends the address, and never reads page titles or content. Because of this, Chrome describes the permission as reading your browsing history.",
  },
  {
    q: "Which sites can I track?",
    a: "Any site you add, up to 50. Subdomains count too: adding python.org also covers docs.python.org.",
  },
  {
    q: "What happens when I step away?",
    a: "After 60 seconds without keyboard or mouse input, tracking pauses. If the study tab in front of you is playing sound (a video, not muted), it keeps counting for up to 15 minutes without input.",
  },
  {
    q: "Does it work offline?",
    a: "Yes. Time is saved on your computer and uploaded when you're back online.",
  },
  {
    q: "Can I use it on more than one computer?",
    a: "Yes. Install the extension on each and connect it to the same account. The dashboard adds them up.",
  },
  { q: "Is it free?", a: "Yes. There's no paid plan." },
  {
    q: "Which browsers?",
    a: "Chrome on desktop. The dashboard works in any modern browser, including on your phone.",
  },
  {
    q: "How do I delete my data?",
    a: 'Settings → Delete account removes your account and all study records right away (encrypted backups expire within 90 days). When the extension is no longer connected, its "Forget local data" clears what\'s left on that computer.',
  },
] as const;

/** Sample week (minutes per day, Monday first): 6h 40m. Sample data, never a real user's. */
export const SAMPLE_WEEK = [55, 80, 40, 95, 65, 30, 35] as const;
/** Sample month (30 days): 22h 50m. */
export const SAMPLE_MONTH = [
  40, 55, 0, 70, 35, 60, 25, 50, 65, 0, 45, 80, 30, 55, 20, 60, 75, 40, 0, 50, 65, 35, 45, 70, 55,
  30, 60, 40, 50, 65,
] as const;
