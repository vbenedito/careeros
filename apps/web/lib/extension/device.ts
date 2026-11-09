/**
 * DASH-11/13: Chrome extensions cannot be installed on phones and tablets, so the dashboard must
 * not ask for one there. Pure: takes the browser's navigator fields.
 */
export interface NavigatorInfo {
  userAgent: string;
  /** User-Agent Client Hints (Chromium); `mobile` is the reliable signal when present. */
  userAgentData?: { mobile?: boolean };
}

export function isMobileBrowser(nav: NavigatorInfo): boolean {
  if (typeof nav.userAgentData?.mobile === "boolean") return nav.userAgentData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
}

/** In the browser: is this a phone or tablet? Always false during server rendering. */
export function onMobileDevice(): boolean {
  return typeof navigator !== "undefined" && isMobileBrowser(navigator as NavigatorInfo);
}
