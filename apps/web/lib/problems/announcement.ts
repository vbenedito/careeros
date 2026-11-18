/**
 * DASH-18: the one-time announcement is dismissed for good in this browser with a flag in
 * `localStorage` (no cookie, no server record). Storage can be missing or throw (private mode,
 * blocked); then the card is shown and Dismiss hides it until the page reloads.
 */
export const ANNOUNCEMENT_KEY = "careeros.problems-announcement-dismissed";

export function isAnnouncementDismissed(storage: Pick<Storage, "getItem"> | undefined): boolean {
  try {
    return storage?.getItem(ANNOUNCEMENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissAnnouncement(storage: Pick<Storage, "setItem"> | undefined): void {
  try {
    storage?.setItem(ANNOUNCEMENT_KEY, "1");
  } catch {
    // Storage is not available: the caller hides the card for this page view only.
  }
}

/** `window.localStorage`, or undefined when even reading the property throws. */
export function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
