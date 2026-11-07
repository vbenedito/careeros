/** Applies the toolbar badge (EXT-UI-10) whenever the stored engine state changes. */
import type { EngineState } from "../engine/engine";
import { type Badge, badgeFor } from "../lib/badge";

export interface ActionApi {
  setBadgeText(details: { text: string }): Promise<void>;
  setBadgeBackgroundColor(details: { color: string }): Promise<void>;
  setTitle(details: { title: string }): Promise<void>;
}

export function createBadgeUpdater(action: ActionApi, name: string) {
  let last: Badge | null = null;
  return async function update(state: EngineState): Promise<void> {
    const next = badgeFor(state, name);
    if (last && last.text === next.text && last.color === next.color && last.title === next.title) {
      return; // unchanged: no API calls on every heartbeat
    }
    await Promise.all([
      action.setBadgeBackgroundColor({ color: next.color }),
      action.setBadgeText({ text: next.text }),
      action.setTitle({ title: next.title }),
    ]);
    last = next; // only once applied: a failed call is retried on the next change
  };
}
