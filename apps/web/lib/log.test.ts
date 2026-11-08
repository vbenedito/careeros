import { afterEach, describe, expect, it, vi } from "vitest";
import { errorFields, logServerError, urlErrorCode } from "./log";

afterEach(() => vi.restoreAllMocks());

describe("server error log (ENV-11)", () => {
  it("ENV-11 one JSON line with the event and only the given fields", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logServerError("dashboard.load_failed", { code: "PGRST202", status: 404, message: "x" });
    expect(JSON.parse(spy.mock.calls[0]?.[0] as string)).toEqual({
      level: "error",
      event: "dashboard.load_failed",
      code: "PGRST202",
      status: 404,
      message: "x",
    });
  });

  it("ENV-11 keeps code, status and a capped message; drops everything else", () => {
    const fields = errorFields({
      code: "PGRST202",
      status: 404,
      message: "m".repeat(500),
      details: "anything",
      hint: "anything",
    } as never);
    expect(Object.keys(fields)).toEqual(["code", "status", "message"]);
    expect(fields.message).toHaveLength(200);
    expect(errorFields({})).toEqual({ code: null, status: null, message: null });
  });
});

describe("error codes from URLs (ENV-11, SEC-06)", () => {
  it("ENV-11 known-shaped codes pass; arbitrary text never reaches the log", () => {
    expect(urlErrorCode("access_denied")).toBe("access_denied");
    expect(urlErrorCode(null)).toBeNull();
    for (const injected of [
      "someone@example.com",
      "https://evil.example/x",
      "eyJhbGciOi.x.y",
      "A".repeat(80),
    ]) {
      expect(urlErrorCode(injected)).toBe("other");
    }
  });
});
