import { describe, expect, it } from "vitest";
import { createMutex, LockTimeoutError } from "./mutex";

describe("createMutex", () => {
  it("AUTH-10 runs tasks one at a time, in order", async () => {
    const exclusive = createMutex();
    const log: string[] = [];
    const task = (name: string, ms: number) => () =>
      new Promise<string>((resolve) => {
        log.push(`start ${name}`);
        setTimeout(() => {
          log.push(`end ${name}`);
          resolve(name);
        }, ms);
      });
    const results = await Promise.all([exclusive(task("a", 20)), exclusive(task("b", 1))]);
    expect(results).toEqual(["a", "b"]);
    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("keeps working after a task fails", async () => {
    const exclusive = createMutex();
    await expect(exclusive(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(exclusive(async () => "ok")).resolves.toBe("ok");
  });

  it("AUTH-10c a holder that never releases: later callers give up after the timeout, without running", async () => {
    const exclusive = createMutex({ acquireTimeoutMs: 20 });
    void exclusive(() => new Promise<never>(() => undefined)); // stuck forever
    let ran = false;
    await expect(
      exclusive(async () => {
        ran = true;
      }),
    ).rejects.toBeInstanceOf(LockTimeoutError);
    expect(ran).toBe(false);
    // Each caller gets its own bounded wait; nobody is queued behind a caller that gave up.
    await expect(exclusive(async () => "late")).rejects.toThrow(LockTimeoutError);
  });

  it("AUTH-10c once a slow holder finishes, the lock works again; waiters within the bound run in order", async () => {
    const exclusive = createMutex({ acquireTimeoutMs: 200 });
    let finish: () => void = () => undefined;
    const slow = exclusive(
      () =>
        new Promise<string>((resolve) => {
          finish = () => resolve("slow");
        }),
    );
    const next = exclusive(async () => "next");
    setTimeout(() => finish(), 10);
    expect(await Promise.all([slow, next])).toEqual(["slow", "next"]);
  });

  it("AUTH-10c a caller that gave up does not delay the ones behind it", async () => {
    const exclusive = createMutex({ acquireTimeoutMs: 30 });
    let finish: () => void = () => undefined;
    void exclusive(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const gaveUp = exclusive(async () => "never");
    await expect(gaveUp).rejects.toBeInstanceOf(LockTimeoutError);
    const after = exclusive(async () => "after");
    finish();
    await expect(after).resolves.toBe("after");
  });
});
