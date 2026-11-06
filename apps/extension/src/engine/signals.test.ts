import { describe, expect, it } from "vitest";
import {
  domainOfTab,
  type IdleState,
  INITIAL_SIGNALS,
  reduceSignals,
  type SignalEvent,
  type Signals,
  type TabSnapshot,
  trackingTarget,
} from "./signals";

const DOMAINS = ["leetcode.com", "neetcode.io", "docs.python.org", "python.org"];
const tab = (url: string | undefined, audible = false): TabSnapshot => ({ url, audible });
const LEETCODE = tab("https://www.leetcode.com/problems/two-sum/?tab=description");

/** Applies events in order and returns the final signals. */
function run(events: SignalEvent[], from: Signals = INITIAL_SIGNALS): Signals {
  return events.reduce((s, e) => reduceSignals(s, e).signals, from);
}

/** Connected, enabled, domains loaded, active user on a focused leetcode tab. */
const tracking = (audible = false): Signals =>
  run([
    { type: "AUTH", connected: true },
    { type: "SETTINGS", trackingEnabled: true },
    { type: "DOMAINS", domains: DOMAINS },
    { type: "IDLE", state: "active" },
    { type: "TAB", tab: { ...LEETCODE, audible } },
  ]);

const heartbeat = (
  t: TabSnapshot | null,
  idle: IdleState,
  mediaIdle: IdleState = "active",
): SignalEvent => ({ type: "HEARTBEAT", tab: t, idle, mediaIdle });

describe("Engine A — eligibility (TRK-01..04)", () => {
  it("TRK-01 tracks only when connected, enabled, domains loaded and a tracked tab is focused", () => {
    expect(trackingTarget(tracking())).toBe("leetcode.com");
    expect(trackingTarget(run([{ type: "AUTH", connected: false }], tracking()))).toBeNull();
    expect(trackingTarget(run([{ type: "SETTINGS", trackingEnabled: false }], tracking()))).toBe(
      null,
    );
    expect(trackingTarget(run([{ type: "TAB", tab: null }], tracking()))).toBeNull();
  });

  it("TRK-01 nothing is tracked before the domain list is loaded", () => {
    const s = run([
      { type: "AUTH", connected: true },
      { type: "TAB", tab: LEETCODE },
    ]);
    expect(s.focusedDomain).toBeNull();
    expect(trackingTarget(s)).toBeNull();
  });

  it("TRK-01 loading the domain list asks for the current tab again", () => {
    const ready = run([
      { type: "AUTH", connected: true },
      { type: "SETTINGS", trackingEnabled: true },
      { type: "IDLE", state: "active" },
    ]);
    const { signals, effects } = reduceSignals(ready, {
      type: "DOMAINS",
      domains: DOMAINS,
    });
    expect(effects).toEqual([{ type: "REQUERY_TAB" }]);
    expect(trackingTarget(run([{ type: "TAB", tab: LEETCODE }], signals))).toBe("leetcode.com");
  });

  it("TRK-01 removing the focused domain from the list stops tracking it", () => {
    const s = run([{ type: "DOMAINS", domains: ["neetcode.io"] }], tracking());
    expect(s.focusedDomain).toBeNull();
    expect(trackingTarget(s)).toBeNull();
    // Keeping it in the list keeps tracking.
    expect(trackingTarget(run([{ type: "DOMAINS", domains: DOMAINS }], tracking()))).toBe(
      "leetcode.com",
    );
  });

  it("TRK-02 only http and https tabs are evaluated", () => {
    for (const url of [
      "chrome://extensions",
      "file:///home/leetcode.com.html",
      "ftp://leetcode.com",
      "not a url",
      undefined,
    ]) {
      expect(domainOfTab(tab(url), DOMAINS)).toBeNull();
    }
    expect(domainOfTab(tab("http://leetcode.com"), DOMAINS)).toBe("leetcode.com");
  });

  it("TRK-02 SEC-02 signals keep the tracked domain only — never the URL or untracked hosts", () => {
    const onTracked = tracking();
    expect(JSON.stringify(onTracked)).not.toMatch(/problems|two-sum|tab=|www\./);
    const onUntracked = run(
      [{ type: "TAB", tab: tab("https://mail.example.com/inbox/42") }],
      onTracked,
    );
    expect(JSON.stringify(onUntracked)).not.toMatch(/example|inbox/);
    expect(onUntracked.focusedDomain).toBeNull();
  });

  it("TRK-03 records the tracked domain, matching subdomains and the longest match", () => {
    expect(domainOfTab(tab("https://WWW.LeetCode.com./x"), DOMAINS)).toBe("leetcode.com");
    expect(domainOfTab(tab("https://notleetcode.com"), DOMAINS)).toBeNull();
    expect(domainOfTab(tab("https://docs.python.org/3/"), DOMAINS)).toBe("docs.python.org");
    expect(domainOfTab(tab("https://wiki.python.org/"), DOMAINS)).toBe("python.org");
    // Longest wins regardless of list order.
    const reversed = ["python.org", "docs.python.org"];
    expect(domainOfTab(tab("https://docs.python.org/3/"), reversed)).toBe("docs.python.org");
  });

  it("TRK-03 an untracked subdomain of a tracked domain is recorded as the tracked domain", () => {
    const s = run([{ type: "TAB", tab: tab("https://mail.leetcode.com/inbox") }], tracking());
    expect(s.focusedDomain).toBe("leetcode.com");
    expect(JSON.stringify(s)).not.toMatch(/mail|inbox/);
  });

  it("TRK-03 invalid entries in the domain list are ignored (defense in depth)", () => {
    const s = run(
      [{ type: "DOMAINS", domains: ["com", "LeetCode.com", "neetcode.io"] }],
      tracking(),
    );
    expect(s.trackedDomains).toEqual(["neetcode.io"]);
    expect(domainOfTab(tab("https://example.com"), s.trackedDomains)).toBeNull();
  });

  it("TRK-04 an unfocused window (no focused tab) is not tracked; refocusing resumes", () => {
    const blurred = run([{ type: "TAB", tab: null }], tracking());
    expect(trackingTarget(blurred)).toBeNull();
    expect(trackingTarget(run([{ type: "TAB", tab: LEETCODE }], blurred))).toBe("leetcode.com");
  });

  it("TRK-04 switching to an untracked tab stops tracking; switching domains changes the target", () => {
    expect(
      trackingTarget(run([{ type: "TAB", tab: tab("https://news.example") }], tracking())),
    ).toBe(null);
    expect(
      trackingTarget(run([{ type: "TAB", tab: tab("https://neetcode.io/roadmap") }], tracking())),
    ).toBe("neetcode.io");
  });
});

describe("Engine A — activity (TRK-05..07)", () => {
  it("TRK-05 idle and locked pause tracking (no media)", () => {
    expect(trackingTarget(run([{ type: "IDLE", state: "idle" }], tracking()))).toBeNull();
    expect(trackingTarget(run([{ type: "IDLE", state: "locked" }], tracking()))).toBeNull();
  });

  it("TRK-06 an audible tracked tab keeps tracking through idle", () => {
    const s = run([{ type: "IDLE", state: "idle" }], tracking(true));
    expect(s.mediaHold).toBe(true);
    expect(trackingTarget(s)).toBe("leetcode.com");
    // Heartbeats below the 15-minute ceiling keep it going.
    expect(trackingTarget(run([heartbeat({ ...LEETCODE, audible: true }, "idle")], s))).toBe(
      "leetcode.com",
    );
  });

  it("TRK-06 the media ceiling (no input for 15 min) pauses tracking", () => {
    const s = run(
      [{ type: "IDLE", state: "idle" }, heartbeat({ ...LEETCODE, audible: true }, "idle", "idle")],
      tracking(true),
    );
    expect(s.mediaHold).toBe(false);
    expect(trackingTarget(s)).toBeNull();
  });

  it("TRK-06 audio stopping while idle pauses immediately, and audio restarting does not resume", () => {
    const held = run([{ type: "IDLE", state: "idle" }], tracking(true));
    const stopped = run([{ type: "TAB", tab: { ...LEETCODE, audible: false } }], held);
    expect(trackingTarget(stopped)).toBeNull();
    const restarted = run([{ type: "TAB", tab: { ...LEETCODE, audible: true } }], stopped);
    expect(trackingTarget(restarted)).toBeNull();
  });

  it("TRK-06 audio starting while the user is already idle does not resume tracking", () => {
    const idle = run([{ type: "IDLE", state: "idle" }], tracking(false));
    expect(trackingTarget(run([{ type: "TAB", tab: { ...LEETCODE, audible: true } }], idle))).toBe(
      null,
    );
  });

  it("TRK-06 locked always pauses immediately, even with audio", () => {
    const held = run([{ type: "IDLE", state: "idle" }], tracking(true));
    const locked = run([{ type: "IDLE", state: "locked" }], held);
    expect(trackingTarget(locked)).toBeNull();
    // Unlocking into idle (no input yet) does not bring the media hold back.
    expect(trackingTarget(run([{ type: "IDLE", state: "idle" }], locked))).toBeNull();
  });

  it("TRK-06 eligibility is still required: an audible tab in an unfocused window is not tracked", () => {
    const held = run([{ type: "IDLE", state: "idle" }], tracking(true));
    const blurred = run([{ type: "TAB", tab: null }], held);
    expect(trackingTarget(blurred)).toBeNull();
    // Refocusing without input does not resume (the hold was lost).
    expect(
      trackingTarget(run([{ type: "TAB", tab: { ...LEETCODE, audible: true } }], blurred)),
    ).toBe(null);
  });

  it("TRK-06 the hold does not follow the tab to another tracked domain without input", () => {
    const held = run([{ type: "IDLE", state: "idle" }], tracking(true));
    const moved = run([{ type: "TAB", tab: tab("https://neetcode.io/x", true) }], held);
    expect(trackingTarget(moved)).toBeNull();
  });

  it("TRK-06 going idle while not tracking never creates a hold", () => {
    const disabled = run([{ type: "SETTINGS", trackingEnabled: false }], tracking(true));
    const idle = run([{ type: "IDLE", state: "idle" }], disabled);
    expect(idle.mediaHold).toBe(false);
    expect(trackingTarget(run([{ type: "SETTINGS", trackingEnabled: true }], idle))).toBeNull();
  });

  it("TRK-06 a heartbeat that first observes idle applies the same rule", () => {
    const viaHeartbeat = run([heartbeat({ ...LEETCODE, audible: true }, "idle")], tracking(true));
    expect(trackingTarget(viaHeartbeat)).toBe("leetcode.com");
    const silent = run([heartbeat(LEETCODE, "idle")], tracking(false));
    expect(trackingTarget(silent)).toBeNull();
  });

  it("TRK-07 tracking resumes automatically on input once every condition holds", () => {
    const idle = run([{ type: "IDLE", state: "idle" }], tracking());
    expect(trackingTarget(run([{ type: "IDLE", state: "active" }], idle))).toBe("leetcode.com");
    const afterCeiling = run(
      [
        { type: "IDLE", state: "idle" },
        heartbeat({ ...LEETCODE, audible: true }, "idle", "idle"),
        { type: "IDLE", state: "active" },
      ],
      tracking(true),
    );
    expect(trackingTarget(afterCeiling)).toBe("leetcode.com");
    expect(afterCeiling.mediaHold).toBe(false);
  });

  it("TRK-16 reduceSignals is pure: the input state is never mutated", () => {
    const before = tracking(true);
    const snapshot = structuredClone(before);
    reduceSignals(before, { type: "IDLE", state: "idle" });
    reduceSignals(before, { type: "DOMAINS", domains: [] });
    reduceSignals(before, { type: "TAB", tab: tab("https://neetcode.io") });
    reduceSignals(before, heartbeat(null, "locked", "locked"));
    reduceSignals(before, { type: "RESYNC" });
    expect(before).toEqual(snapshot);
  });
});

describe("Engine A — heartbeats that observe several changes at once (TRK-06, TRK-13)", () => {
  it("TRK-06 a heartbeat that changes domain and goes idle together does not create a hold", () => {
    const s = run([heartbeat(tab("https://neetcode.io/x", true), "idle")], tracking(true));
    expect(s.mediaHold).toBe(false);
    expect(trackingTarget(s)).toBeNull();
  });

  it("TRK-06 a heartbeat that sees audio start and idle together does not create a hold", () => {
    const s = run([heartbeat({ ...LEETCODE, audible: true }, "idle")], tracking(false));
    expect(s.mediaHold).toBe(false);
    expect(trackingTarget(s)).toBeNull();
  });

  it("TRK-06 the ceiling also ends the hold when the 15-minute query reports locked", () => {
    const held = run([{ type: "IDLE", state: "idle" }], tracking(true));
    const s = run([heartbeat({ ...LEETCODE, audible: true }, "idle", "locked")], held);
    expect(trackingTarget(s)).toBeNull();
  });

  it("TRK-07 a heartbeat reporting active resumes after a missed IDLE active event", () => {
    const idle = run([{ type: "IDLE", state: "idle" }], tracking());
    expect(trackingTarget(run([heartbeat(LEETCODE, "active")], idle))).toBe("leetcode.com");
  });

  it("TRK-02 SEC-02 heartbeats never put URLs or untracked hosts into the signals", () => {
    const s = run([heartbeat(tab("https://bank.example/account/123?x=1"), "active")], tracking());
    expect(JSON.stringify(s)).not.toMatch(/bank|account|123/);
  });
});

describe("Engine A — domain list changes during a media hold (TRK-01, TRK-06)", () => {
  it("TRK-06 keeping the domain keeps the hold; removing it ends it and re-adding does not restore it", () => {
    const held = run([{ type: "IDLE", state: "idle" }], tracking(true));
    expect(trackingTarget(run([{ type: "DOMAINS", domains: DOMAINS }], held))).toBe("leetcode.com");
    const removed = run([{ type: "DOMAINS", domains: ["neetcode.io"] }], held);
    expect(trackingTarget(removed)).toBeNull();
    const readded = run(
      [
        { type: "DOMAINS", domains: DOMAINS },
        { type: "TAB", tab: { ...LEETCODE, audible: true } },
      ],
      removed,
    );
    expect(trackingTarget(readded)).toBeNull();
  });
});

describe("Engine A — startup and resync (TRK-01, TRK-14, TRK-15, TRK-19)", () => {
  it("TRK-01 a fresh worker assumes nothing: settings and idle state must be reported first", () => {
    const partial = run([
      { type: "AUTH", connected: true },
      { type: "DOMAINS", domains: DOMAINS },
      { type: "TAB", tab: LEETCODE },
    ]);
    expect(trackingTarget(partial)).toBeNull(); // tracking setting not loaded, idle unknown
    const withSettings = run([{ type: "SETTINGS", trackingEnabled: true }], partial);
    expect(trackingTarget(withSettings)).toBeNull(); // idle still unknown
    expect(trackingTarget(run([{ type: "IDLE", state: "active" }], withSettings))).toBe(
      "leetcode.com",
    );
  });

  it("TRK-01 tracking disabled on this device is respected even if SETTINGS arrives last", () => {
    const s = run([{ type: "SETTINGS", trackingEnabled: false }], tracking());
    expect(trackingTarget(s)).toBeNull();
  });

  it("TRK-14 RESYNC forgets stale observations and asks for fresh ones", () => {
    const { signals, effects } = reduceSignals(
      run([{ type: "IDLE", state: "idle" }], tracking(true)),
      {
        type: "RESYNC",
      },
    );
    expect(effects).toEqual([{ type: "REQUERY_TAB" }, { type: "REQUERY_IDLE" }]);
    expect(signals).toMatchObject({
      focusedDomain: null,
      audible: false,
      idle: "unknown",
      mediaHold: false,
    });
    expect(signals).toMatchObject({
      connected: true,
      trackingEnabled: true,
      trackedDomains: DOMAINS,
    });
    expect(trackingTarget(signals)).toBeNull();
    // Fresh observations bring tracking back, but a stale media hold never returns.
    const fresh = run(
      [
        { type: "TAB", tab: { ...LEETCODE, audible: true } },
        { type: "IDLE", state: "idle" },
      ],
      signals,
    );
    expect(trackingTarget(fresh)).toBeNull();
    expect(trackingTarget(run([{ type: "IDLE", state: "active" }], fresh))).toBe("leetcode.com");
  });

  it("TRK-16 one event changes the tracking target at most once (B diffs before/after)", () => {
    // Every event type maps to a single reducer step; this guards the contract B relies on.
    const events: SignalEvent[] = [
      { type: "AUTH", connected: false },
      { type: "SETTINGS", trackingEnabled: false },
      { type: "DOMAINS", domains: [] },
      { type: "TAB", tab: null },
      { type: "IDLE", state: "locked" },
      heartbeat(null, "idle", "idle"),
      { type: "RESYNC" },
    ];
    for (const e of events) {
      const { signals } = reduceSignals(tracking(), e);
      expect(trackingTarget(signals)).toBeNull();
    }
  });
});
