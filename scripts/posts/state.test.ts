import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCli } from "./cli.ts";
import { parseFfprobe } from "./probe.ts";
import { type Exec, emptyState, GitStateStore, StatePushError, statePath } from "./state.ts";

const scripted = (codes: Record<string, number[]>): { exec: Exec; calls: string[] } => {
  const calls: string[] = [];
  const queues = new Map(Object.entries(codes).map(([k, v]) => [k, [...v]]));
  const exec: Exec = async (_cmd, args) => {
    const key =
      args
        .filter((a) => !a.startsWith("user.") && a !== "-c")
        .join(" ")
        .split(" -m")[0] ?? "";
    calls.push(key);
    const q = queues.get(key);
    return { code: q?.shift() ?? 0 };
  };
  return { exec, calls };
};

describe("PST-07 and PST-13 state store", () => {
  it("PST-07 writes the state file at posts-state/YYYY/<stem>.json and reads it back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "state-"));
    const store = new GitStateStore(dir, scripted({}).exec);
    expect(await store.read("2026-11-26-a-b")).toBeNull();
    await store.write("2026-11-26-a-b", emptyState());
    expect(statePath("2026-11-26-a-b")).toBe("posts-state/2026/2026-11-26-a-b.json");
    expect(JSON.parse(await readFile(join(dir, statePath("2026-11-26-a-b")), "utf8"))).toEqual({
      schema: 1,
      platforms: {},
    });
    expect(await store.read("2026-11-26-a-b")).toEqual(emptyState());
  });
  it("PST-13 commits and pushes the state", async () => {
    const { exec, calls } = scripted({ "diff --cached --quiet": [1] });
    await new GitStateStore("/x", exec).commitAndPush("msg");
    expect(calls).toEqual(["add -- posts-state", "diff --cached --quiet", "commit", "push"]);
  });
  it("PST-13 nothing to commit means no commit and no push", async () => {
    const { exec, calls } = scripted({});
    await new GitStateStore("/x", exec).commitAndPush("msg");
    expect(calls).toEqual(["add -- posts-state", "diff --cached --quiet"]);
  });
  it("PST-11 a rejected push is rebased once and pushed again", async () => {
    const { exec, calls } = scripted({ "diff --cached --quiet": [1], push: [1, 0] });
    await new GitStateStore("/x", exec).commitAndPush("msg");
    expect(calls.slice(-3)).toEqual(["push", "pull --rebase", "push"]);
  });
  it("PST-11 a push that fails after the rebase throws StatePushError", async () => {
    const { exec } = scripted({ "diff --cached --quiet": [1], push: [1, 1] });
    await expect(new GitStateStore("/x", exec).commitAndPush("msg")).rejects.toBeInstanceOf(
      StatePushError,
    );
  });
  it("PST-11 a failed rebase is aborted and throws StatePushError", async () => {
    const { exec, calls } = scripted({
      "diff --cached --quiet": [1],
      push: [1],
      "pull --rebase": [1],
    });
    await expect(new GitStateStore("/x", exec).commitAndPush("msg")).rejects.toBeInstanceOf(
      StatePushError,
    );
    expect(calls.at(-1)).toBe("rebase --abort");
  });
});

describe("PST-11 CLI arguments and probe", () => {
  it("PST-11 parses the options and defaults the post time", () => {
    const a = parseCli(
      ["publish", "--ops-dir", "d", "--dry-run", "--now", "2026-11-26T22:00:00Z"],
      {},
    );
    expect(a).toMatchObject({ command: "publish", opsDir: "d", dryRun: true, postTime: "19:00" });
    expect(parseCli(["cron-lines", "--post-time", "21:30"], {}).postTime).toBe("21:30");
    expect(parseCli(["publish"], { POST_TIME: "20:00" }).postTime).toBe("20:00");
  });
  it("PST-11 rejects a bad call", () => {
    expect(() => parseCli(["publish", "--bogus", "x"], {})).toThrow();
    expect(() => parseCli(["publish", "--now", "nope"], {})).toThrow();
    expect(() => parseCli(["publish", "--post-time", "7pm"], {})).toThrow();
    expect(() => parseCli(["publish", "--ops-dir"], {})).toThrow();
  });
  it("PST-09 reads width, height and length from ffprobe json", () => {
    const json = JSON.stringify({
      streams: [{ codec_type: "audio" }, { codec_type: "video", width: 1080, height: 1920 }],
      format: { duration: "30.5" },
    });
    expect(parseFfprobe(json)).toEqual({ width: 1080, height: 1920, durationS: 30.5 });
    expect(() => parseFfprobe("{}")).toThrow();
  });
});

describe("PST-22 tokens.json", () => {
  it("PST-22 the token file holds expiry dates only and round-trips through the git store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "posts-tokens-"));
    const store = new GitStateStore(dir, async () => ({ code: 0 }));
    expect(await store.readTokens()).toBeNull();
    const tokens = {
      schema: 1 as const,
      checked_on: "2026-11-27",
      instagram: { ok: true, expires_on: null },
      ops_pat: { expires_on: "2027-03-01" },
    };
    await store.writeTokens(tokens);
    expect(await store.readTokens()).toEqual(tokens);
    await expect(
      store.writeTokens({
        ...tokens,
        instagram: { ok: true, expires_on: null, token: "x" },
      } as never),
    ).rejects.toThrow();
  });
});
