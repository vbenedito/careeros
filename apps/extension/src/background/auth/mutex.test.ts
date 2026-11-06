import { describe, expect, it } from "vitest";
import { createMutex } from "./mutex";

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
});
