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
    { type: "DOMAINS", domains: DOMAINS },
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
    const { signals, effects } = reduceSignals(run([{ type: "AUTH", connected: true }]), {
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
    expect(before).toEqual(snapshot);
  });
});
