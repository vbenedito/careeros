import { describe, expect, it } from "vitest";
import {
  createRateLimiter,
  ErrorReportSchema,
  requestErrorFields,
  toErrorReport,
} from "./error-report";

describe("error reports (ENV-11)", () => {
  it("ENV-11 the browser sends only source, class name and digest, never the message", () => {
    const error = Object.assign(new TypeError("secret@example.test failed"), { digest: "123456" });
    const report = toErrorReport("page", error);
    expect(report).toEqual({ source: "page", name: "TypeError", digest: "123456" });
    expect(JSON.stringify(report)).not.toContain("secret");
  });

  it("ENV-11 odd names and digests are dropped, not sent", () => {
    const error = Object.assign(new Error("x"), { name: "Bad Name <script>", digest: "a b" });
    expect(toErrorReport("global", error)).toEqual({ source: "global" });
    expect(toErrorReport("global", "a string")).toEqual({ source: "global" });
    expect(toErrorReport("global", null)).toEqual({ source: "global" });
  });

  it("ENV-11 the schema rejects extra fields and long values", () => {
    expect(ErrorReportSchema.safeParse({ source: "page", message: "x" }).success).toBe(false);
    expect(ErrorReportSchema.safeParse({ source: "other" }).success).toBe(false);
    expect(ErrorReportSchema.safeParse({ source: "page", digest: "x".repeat(41) }).success).toBe(
      false,
    );
  });

  it("ENV-11 the rate limiter allows `max` per window, then resets", () => {
    let t = 0;
    const allow = createRateLimiter(2, 1000, () => t);
    expect([allow(), allow(), allow()]).toEqual([true, true, false]);
    t = 1000;
    expect(allow()).toBe(true);
  });

  it("ENV-11 onRequestError logs route pattern, class and digest only", () => {
    const error = Object.assign(new RangeError("user@example.test"), { digest: "abc123" });
    const fields = requestErrorFields(error, {
      routePath: "/api/sites/[id]",
      routeType: "route",
      routerKind: "App Router",
    });
    expect(fields).toEqual({
      code: "request_error",
      name: "RangeError",
      digest: "abc123",
      route: "/api/sites/[id]",
      routeType: "route",
    });
    expect(JSON.stringify(fields)).not.toContain("example.test");
    expect(requestErrorFields("boom", {}).name).toBeNull();
  });
});
