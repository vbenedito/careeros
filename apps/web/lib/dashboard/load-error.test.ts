import { describe, expect, it } from "vitest";
import { classifyLoadError } from "./load-error";

describe("DASH-11 load error kinds (#70)", () => {
  it.each([
    [{ status: 0, code: "" }, "network failure"],
    [{ status: 503, code: "PGRST002" }, "schema cache loading"],
    [{ status: 500, code: "57014" }, "statement timeout"],
    [{ status: 503, code: "08006" }, "connection failure"],
    [{ status: 504 }, "gateway timeout"],
    [{ status: 429 }, "rate limited"],
    [{ status: 408 }, "request timeout"],
    [{}, "unknown shape"],
  ])("temporary: %o (%s)", (error, _why) => {
    expect(classifyLoadError(error)).toBe("temporary");
  });

  it.each([
    [{ status: 404, code: "PGRST202" }, "function missing"],
    [{ status: 500, code: "42883" }, "undefined function, even with a 5xx"],
    [{ status: 403, code: "42501" }, "no permission"],
    [{ status: 400, code: "22P02" }, "bad request"],
    [{ status: 401 }, "not authenticated"],
  ])("permanent: %o (%s)", (error, _why) => {
    expect(classifyLoadError(error)).toBe("permanent");
  });
});
