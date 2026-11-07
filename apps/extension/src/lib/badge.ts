/**
 * Toolbar badge (EXT-UI-10): one quiet signal on the extension icon.
 * - Tracking → small green dot; not connected → amber "!"; anything else → no badge.
 * Pure: the worker applies the result with chrome.action.
 */
import type { EngineState } from "../engine/engine";

export interface Badge {
  /** "" hides the badge. */
  text: string;
  /** sRGB hex — the Chrome badge API takes a color, not a CSS token (mirrors success/warning). */
  color: string;
  /** Tooltip of the toolbar button: the state in words (EXT-UI-09). */
  title: string;
}

const SUCCESS = "#16a34a";
const WARNING = "#b45309"; // darker amber: white "!" stays readable (≈5:1)

export function badgeFor(state: EngineState, name: string): Badge {
  if (!state.signals.connected) {
    return { text: "!", color: WARNING, title: `${name} — not connected` };
  }
  if (state.open) {
    return { text: " ", color: SUCCESS, title: `${name} — tracking ${state.open.domain}` };
  }
  return { text: "", color: SUCCESS, title: `${name} — not tracking` };
}
