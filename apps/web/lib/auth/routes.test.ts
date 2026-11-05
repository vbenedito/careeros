import { describe, expect, it } from "vitest";
import { isApiPath, isAuthProvider, isPublicPath, safeNextPath } from "./routes";

describe("isPublicPath", () => {
  it.each(["/sign-in", "/auth/callback", "/auth/sign-in", "/privacy"])(
    "AUTH-03 %s is public",
    (p) => {
      expect(isPublicPath(p)).toBe(true);
    },
  );

  it.each(["/", "/settings", "/connect", "/sign-inx", "/auth/sign-out", "/api/extension/link"])(
    "AUTH-03 %s requires a session",
    (p) => {
      expect(isPublicPath(p)).toBe(false);
    },
  );
});

describe("isApiPath", () => {
  it("AUTH-03 recognizes API routes (answered with 401, not a redirect)", () => {
    expect(isApiPath("/api/extension/link")).toBe(true);
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/apiary")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/settings", "/settings"],
    ["/?view=week&date=2026-11-02", "/?view=week&date=2026-11-02"],
    ["/privacy", "/privacy"],
  ])("AUTH-03 keeps same-origin path %s", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "settings",
    "https://evil.example/x",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/sign-in",
    "/auth/callback?code=x",
  ])("AUTH-03 rejects %j and falls back to /", (raw) => {
    expect(safeNextPath(raw)).toBe("/");
  });
});

describe("isAuthProvider", () => {
  it("AUTH-01 only google and github", () => {
    expect(isAuthProvider("google")).toBe(true);
    expect(isAuthProvider("github")).toBe(true);
    expect(isAuthProvider("email")).toBe(false);
    expect(isAuthProvider(undefined)).toBe(false);
  });
});
