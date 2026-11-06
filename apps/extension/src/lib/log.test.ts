import { describe, expect, it } from "vitest";
import { createLogger, type LogLevel } from "./log";

describe("logger (ENV-10)", () => {
  it("ENV-10 debug lines only in development builds; other levels always", () => {
    const lines: [LogLevel, string][] = [];
    const sink = (level: LogLevel, line: string) => lines.push([level, line]);
    createLogger({ debug: false, sink }).debug("x");
    createLogger({ debug: false, sink }).warn("w", { n: 1 });
    createLogger({ debug: true, sink }).debug("d");
    expect(lines).toEqual([
      ["warn", '[careeros] warn w {"n":1}'],
      ["debug", "[careeros] debug d {}"],
    ]);
  });
});
