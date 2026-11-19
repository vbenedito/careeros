import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { toError } from "./supabase-domains";

const err = (code: string, hint = "") =>
  ({ code, hint, message: "", details: "" }) as unknown as PostgrestError;

describe("domain API error mapping (AUTH-11, SYNC-10)", () => {
  it("AUTH-11 a deleted user (FK violation) or a token without user means the session is gone", () => {
    expect(toError(err("23503"), 409)?.code).toBe("UNAUTHORIZED");
    expect(toError(err("PT401"), 401)?.code).toBe("UNAUTHORIZED");
  });

  it("an expired JWT is temporary; the site limit has its own error; the rest is unavailable", () => {
    expect(toError(err("PGRST301"), 401)?.code).toBe("UNAVAILABLE");
    expect(toError(err("P0001", "DATA-01"), 400)?.code).toBe("LIMIT_REACHED");
    expect(toError(err("XX000"), 500)?.code).toBe("UNAVAILABLE");
    expect(toError(null, 200)).toBeNull();
  });
});

describe("site limit error (ENT-06, ENT-07)", () => {
  const withDetails = (details: unknown, hint = "") =>
    ({ code: "P0001", hint, message: "", details }) as unknown as PostgrestError;
  const json = (limit: unknown) => JSON.stringify({ code: "LIMIT_REACHED", limit, plan: "free" });

  it("ENT-07 reads the limit from the error details (a JSON string or an object)", () => {
    expect(toError(withDetails(json(12), "DATA-01"), 400)).toMatchObject({
      code: "LIMIT_REACHED",
      limit: 12,
    });
    expect(
      toError(withDetails({ code: "LIMIT_REACHED", limit: 30, plan: "pro" }, "DATA-01"), 400),
    ).toMatchObject({ code: "LIMIT_REACHED", limit: 30 });
  });

  it("ENT-07 the number comes from the error, not from a constant", () => {
    expect(toError(withDetails(json(7)), 400)?.limit).toBe(7);
  });

  it("ENT-06 ENT-07 an old server (hint only) or invalid details: LIMIT_REACHED without a number", () => {
    for (const details of ["", "not json", json("12"), json(0), '{"code":"OTHER"}', null]) {
      const mapped = toError(withDetails(details, "DATA-01"), 400);
      expect(mapped?.code).toBe("LIMIT_REACHED");
      expect(mapped?.limit).toBeUndefined();
    }
  });

  it("ENT-07 details without the hint or a valid code are not a limit error", () => {
    expect(toError(withDetails("", ""), 400)?.code).toBe("UNAVAILABLE");
  });
});
