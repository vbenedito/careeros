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
