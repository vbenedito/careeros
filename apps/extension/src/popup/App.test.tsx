// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type EngineState, INITIAL_ENGINE_STATE } from "../engine/engine";
import type { PopupInput } from "../lib/popup-view";
import { INITIAL_SYNC_STATE } from "../lib/sync-state";
import { App } from "./App";
import type { PopupData } from "./data";

const TODAY = Date.UTC(2026, 10, 9, 3, 0, 0);
const NOW = TODAY + 3600_000;
const tracking: EngineState = {
  ...INITIAL_ENGINE_STATE,
  open: {
    id: "00000000-0000-4000-8000-0000000000ff",
    domain: "leetcode.com",
    startedAt: (NOW - 25 * 60_000) / 1000,
  },
};

function fixture(over: Partial<Omit<PopupInput, "now">> = {}) {
  const loaded: Omit<PopupInput, "now"> = {
    startOfToday: TODAY,
    auth: { connected: true, email: "a@example.test" },
    trackingEnabled: true,
    trackedDomains: ["leetcode.com"],
    engine: INITIAL_ENGINE_STATE,
    todayIntervals: [],
    sync: { ...INITIAL_SYNC_STATE, lastSyncedAt: NOW - 60_000, lastOutcome: "ok" },
    counts: { pending: 0, quarantined: 0 },
    activeTabUrl: "https://news.example/x",
    ...over,
  };
  const data: PopupData & { added: string[]; opened: (string | undefined)[] } = {
    added: [],
    opened: [],
    version: "0.1.0",
    load: async () => loaded,
    subscribe: () => () => {},
    refreshSites: async () => {},
    async addSite(input) {
      this.added.push(input);
      return { ok: true };
    },
    openDashboard(path) {
      this.opened.push(path);
    },
  };
  return data;
}

const renderApp = (data: PopupData) => render(<App data={data} now={() => NOW} />);
afterEach(cleanup);

describe("popup main view (EXT-UI-01..05b, 09)", () => {
  it("EXT-UI-01 EXT-UI-04 tracking: today total, current session, top sites, footer", async () => {
    renderApp(fixture({ engine: tracking }));
    expect(await screen.findByTestId("status")).toHaveProperty("dataset.state", "tracking");
    expect(screen.getByText("Tracking")).toBeTruthy();
    expect(screen.getByTestId("today-total").textContent).toBe("25m");
    expect(screen.getByText("Today on this device")).toBeTruthy();
    expect(screen.getByTestId("current-session").textContent).toBe("leetcode.com · 25m");
    expect(screen.getByRole("region", { name: "Top sites today" }).textContent).toContain(
      "leetcode.com",
    );
    expect(screen.getByTestId("sync-label").textContent).toBe("Synced · 1m ago");
    expect(screen.getByText("v0.1.0")).toBeTruthy();
  });

  it("EXT-UI-05 SYNC-10 not a study site: offers to add the normalized host", async () => {
    const data = fixture({ activeTabUrl: "https://www.NeetCode.io/roadmap" });
    renderApp(data);
    fireEvent.click(await screen.findByRole("button", { name: "Add neetcode.io" }));
    await waitFor(() => expect(data.added).toEqual(["neetcode.io"]));
  });

  it("shows the server's error when adding fails", async () => {
    const data = fixture({ activeTabUrl: "https://neetcode.io/" });
    data.addSite = async () => ({ ok: false, error: "LIMIT_REACHED" });
    renderApp(data);
    fireEvent.click(await screen.findByRole("button", { name: "Add neetcode.io" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You can track up to 50 sites.");
  });

  it.each([
    [
      { activeTabUrl: "https://leetcode.com/x" },
      "idle",
      "Paused — inactive",
      "Resumes when you're back",
    ],
    [{ trackedDomains: [] }, "no-sites", "No study sites yet", "Add this site"],
    [{ trackingEnabled: false }, "disabled", "Tracking off", "Turn on in Settings"],
    [
      { auth: { connected: false, email: null } },
      "disconnected",
      "Not connected",
      "Connect account",
    ],
  ] as const)("status %#: %s", async (over, state, label, hint) => {
    renderApp(fixture(over as Partial<Omit<PopupInput, "now">>));
    expect((await screen.findByTestId("status")).dataset.state).toBe(state);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(hint)).toBeTruthy();
  });

  it("disconnected: Connect account opens the dashboard's connect page", async () => {
    const data = fixture({ auth: { connected: false, email: null } });
    renderApp(data);
    fireEvent.click(await screen.findByRole("button", { name: "Connect account" }));
    expect(data.opened).toEqual(["/connect"]);
  });

  it("EXT-UI-09 every control is a real button with a text label; status is text, not color only", async () => {
    renderApp(fixture({ engine: tracking }));
    await screen.findByTestId("status");
    for (const button of screen.getAllByRole("button"))
      expect(button.textContent?.trim()).not.toBe("");
    expect(screen.getByTestId("status").textContent).toContain("Tracking");
  });

  it("EXT-UI-02 live values update every second", async () => {
    let t = NOW;
    render(<App data={fixture({ engine: tracking })} now={() => t} />);
    expect((await screen.findByTestId("today-total")).textContent).toBe("25m");
    t += 60_000;
    await waitFor(() => expect(screen.getByTestId("today-total").textContent).toBe("26m"), {
      timeout: 2500,
    });
  });
});
