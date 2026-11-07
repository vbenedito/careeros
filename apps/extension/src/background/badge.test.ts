import { describe, expect, it } from "vitest";
import { type EngineState, INITIAL_ENGINE_STATE } from "../engine/engine";
import { badgeFor } from "../lib/badge";
import { createBadgeUpdater } from "./badge";

const connected: EngineState = {
  ...INITIAL_ENGINE_STATE,
  signals: { ...INITIAL_ENGINE_STATE.signals, connected: true },
};
const tracking: EngineState = {
  ...connected,
  open: { id: "00000000-0000-4000-8000-000000000001", domain: "leetcode.com", startedAt: 1 },
};

describe("toolbar badge (EXT-UI-10)", () => {
  it("EXT-UI-10 tracking → green dot; not connected → amber !; otherwise nothing", () => {
    expect(badgeFor(tracking, "CareerOS")).toEqual({
      text: " ",
      color: "#16a34a",
      title: "CareerOS — tracking leetcode.com",
    });
    expect(badgeFor(INITIAL_ENGINE_STATE, "CareerOS")).toMatchObject({
      text: "!",
      title: "CareerOS — not connected",
    });
    expect(badgeFor(connected, "CareerOS")).toMatchObject({
      text: "",
      title: "CareerOS — not tracking",
    });
  });

  it("EXT-UI-10 the badge is only updated when it changes (not on every heartbeat)", async () => {
    const calls: string[] = [];
    const update = createBadgeUpdater(
      {
        setBadgeText: async ({ text }) => void calls.push(`text:${JSON.stringify(text)}`),
        setBadgeBackgroundColor: async ({ color }) => void calls.push(`color:${color}`),
        setTitle: async ({ title }) => void calls.push(`title:${title}`),
      },
      "CareerOS",
    );
    await update(tracking);
    await update(tracking);
    expect(calls).toHaveLength(3);
    await update(connected);
    expect(calls.slice(3)).toEqual(["color:#16a34a", 'text:""', "title:CareerOS — not tracking"]);
  });
});
