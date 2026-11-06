import { describe, expect, it } from "vitest";
import { createSerialQueue } from "./queue";

describe("serial queue (TRK-17)", () => {
  it("TRK-17 runs tasks one at a time, in order, even when they await", async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([
      enqueue(task("a", 20)),
      enqueue(task("b", 1)),
      enqueue(task("c", 5)),
    ]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("TRK-17 a failing task does not block the next one", async () => {
    const errors: unknown[] = [];
    const enqueue = createSerialQueue((e) => errors.push(e));
    const failed = enqueue(async () => {
      throw new Error("boom");
    });
    await expect(failed).rejects.toThrow("boom");
    expect(await enqueue(async () => "next")).toBe("next");
    expect(errors).toHaveLength(1);
  });
});
