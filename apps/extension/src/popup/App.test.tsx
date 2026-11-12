// @vitest-environment jsdom
import { DATA } from "@careeros/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type EngineState, INITIAL_ENGINE_STATE } from "../engine/engine";
import type { PopupDisconnectResult } from "../lib/popup-messages";
import type { PopupInput } from "../lib/popup-view";
import { INITIAL_SYNC_STATE } from "../lib/sync-state";
import { App } from "./App";
import type { CommandResult, PopupData } from "./data";

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
  const calls: string[] = [];
  const added: string[] = [];
  const opened: (string | undefined)[] = [];
  const data: PopupData & {
    added: string[];
    opened: (string | undefined)[];
    calls: string[];
    disconnectReply: PopupDisconnectResult[];
    addReply: CommandResult[];
  } = {
    added,
    opened,
    calls,
    disconnectReply: [],
    addReply: [],
    version: "0.1.0",
    load: async () => loaded,
    subscribe: () => () => {},
    holdFocus: () => () => {},
    refreshSites: async () => {},
    addSite: async (input) => {
      added.push(input);
      return data.addReply.shift() ?? { ok: true };
    },
    removeSite: async (domain) => {
      calls.push(`remove:${domain}`);
      return { ok: true };
    },
    setTracking: async (enabled) => {
      calls.push(`tracking:${enabled}`);
    },
    disconnect: async (discard) => {
      calls.push(`disconnect:${discard}`);
      return data.disconnectReply.shift() ?? { ok: true };
    },
    forgetLocalData: async () => {
      calls.push("forget");
      return { ok: true };
    },
    openDashboard: (path) => {
      opened.push(path);
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
    expect((await screen.findByRole("alert")).textContent).toBe(
      `You can track up to ${DATA.MAX_TRACKED_DOMAINS} sites.`,
    );
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
    for (const button of screen.getAllByRole("button")) {
      // A visible text label, or an aria-label for the icon-only Settings button.
      expect(button.textContent?.trim() || button.getAttribute("aria-label")).toBeTruthy();
    }
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

describe("popup settings view (EXT-UI-06..08, AUTH-12)", () => {
  const openSettings = async (data: PopupData) => {
    renderApp(data);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  };

  it("EXT-UI-06 the tracking switch sends the new value to the worker", async () => {
    const data = fixture();
    await openSettings(data);
    const toggle = screen.getByRole("switch", { name: /Tracking/ });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() => expect(data.calls).toContain("tracking:false"));
  });

  it("EXT-UI-07 lists the sites; remove and add go to the worker; errors are shown", async () => {
    const data = fixture({ trackedDomains: ["leetcode.com", "neetcode.io"] });
    await openSettings(data);
    expect(screen.getByTestId("sites").textContent).toContain("neetcode.io");
    fireEvent.click(screen.getByRole("button", { name: "Remove neetcode.io" }));
    await waitFor(() => expect(data.calls).toContain("remove:neetcode.io"));
    fireEvent.change(screen.getByRole("textbox", { name: "Site to track" }), {
      target: { value: " docs.python.org " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(data.added).toEqual(["docs.python.org"]));
    data.addReply.push({ ok: false, error: "INVALID_DOMAIN" });
    fireEvent.change(screen.getByRole("textbox", { name: "Site to track" }), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That doesn't look like a website address.",
    );
  });

  it("AUTH-12 disconnect asks before deleting unsynced sessions", async () => {
    const data = fixture();
    const unsynced = { ok: false, code: "UNSYNCED_DATA", pending: 3 } as const;
    data.disconnectReply.push(unsynced, unsynced);
    await openSettings(data);
    expect(screen.getByTestId("account-email").textContent).toBe("a@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete unsynced sessions?" });
    expect(dialog.textContent).toContain("3 study sessions haven't been uploaded yet");
    // EXT-UI-09: the confirmation takes focus (safe choice first) and gives it back on close.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep connected" })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep connected" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Disconnect" })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Disconnect and delete" }));
    await waitFor(() =>
      expect(data.calls).toEqual(["disconnect:false", "disconnect:false", "disconnect:true"]),
    );
  });

  it("EXT-UI-08 no account section when not connected; Back returns to the main view", async () => {
    const data = fixture({ auth: { connected: false, email: null } });
    await openSettings(data);
    expect(screen.queryByRole("heading", { name: "Account" })).toBeNull();
    // No site list or Add form that could only fail; a way to connect instead.
    expect(screen.queryByText("Loading your sites…")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Site to track" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connect account" }));
    expect(data.opened).toEqual(["/connect"]);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByTestId("today-total")).toBeTruthy();
  });

  it("AUTH-11a disconnected with the last account's data: Forget local data, after confirming", async () => {
    const data = fixture({
      auth: { connected: false, email: null },
      counts: { pending: 2, quarantined: 0 },
    });
    await openSettings(data);
    const section = screen.getByRole("region", { name: "Data on this computer" });
    expect(section.textContent).toContain("2 sessions not uploaded yet");
    fireEvent.click(screen.getByRole("button", { name: "Forget local data" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Forget local data?" });
    expect(dialog.textContent).toContain("are lost");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep" })),
    );
    expect(data.calls).toEqual([]);
    // Escape and Keep close without deleting; focus returns to the opener.
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Forget local data" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Forget local data" }));
    await screen.findByRole("alertdialog", { name: "Forget local data?" });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Forget local data" }).at(-1) as HTMLElement,
    );
    await waitFor(() => expect(data.calls).toEqual(["forget"]));
    // The section is about to disappear: focus goes to Connect account and the result is announced.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Connect account" })),
    );
    expect(screen.getByRole("status").textContent).toBe("Local data deleted.");
  });

  it("AUTH-11a refused because an account connected meanwhile: says so", async () => {
    const data = fixture({
      auth: { connected: false, email: null },
      counts: { pending: 1, quarantined: 0 },
    });
    data.forgetLocalData = async () => ({ ok: false, code: "CONNECTED" });
    await openSettings(data);
    fireEvent.click(screen.getByRole("button", { name: "Forget local data" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Forget local data" }).at(-1) as HTMLElement,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("Use Disconnect instead");
  });

  it("AUTH-11a nothing left on this computer: no Forget local data section", async () => {
    const data = fixture({
      auth: { connected: false, email: null },
      engine: INITIAL_ENGINE_STATE,
      todayIntervals: [],
      trackedDomains: null,
      sync: INITIAL_SYNC_STATE,
      counts: { pending: 0, quarantined: 0 },
    });
    await openSettings(data);
    expect(screen.queryByRole("region", { name: "Data on this computer" })).toBeNull();
  });

  it("main view: 'Turn on in Settings' opens the settings view", async () => {
    renderApp(fixture({ trackingEnabled: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Turn on in Settings" }));
    expect(screen.getByRole("switch", { name: /Tracking/ })).toBeTruthy();
  });
});
