import { describe, expect, it } from "vitest";
import { errorKind } from "./error-kind";

describe("errorKind (SYNC-06b)", () => {
  it("SYNC-06b uses the class name and a known code, never the message", () => {
    expect(errorKind(new TypeError("token abc for a@example.test"))).toBe("TypeError");
    const coded = Object.assign(new Error("https://secret.example/path"), {
      name: "AuthApiError",
      code: "refresh_token_not_found",
    });
    expect(errorKind(coded)).toBe("AuthApiError:refresh_token_not_found");
  });

  it("SYNC-06b anything that does not look like a label is not passed through", () => {
    expect(errorKind(Object.assign(new Error("x"), { name: "a@example.test" }))).toBe("Error");
    expect(errorKind(Object.assign(new Error("x"), { code: "https://x.test" }))).toBe("Error");
    expect(errorKind("a@example.test")).toBe("string");
    expect(errorKind(42)).toBe("number");
    expect(errorKind(undefined)).toBe("none");
    expect(errorKind({ name: "x".repeat(60) })).toBe("Error");
  });
});
