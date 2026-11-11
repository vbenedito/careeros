import { describe, expect, it } from "vitest";
import { isApiPath, isAuthProvider, isPublicPath, safeNextPath } from "./routes";

describe("isPublicPath", () => {
  it.each([
    "/sign-in",
    "/auth/callback",
    "/auth/sign-in",
    "/privacy",
    "/fonts/mona-sans-latin-wght.woff2",
  ])("AUTH-03 %s is public", (p) => {
    expect(isPublicPath(p)).toBe(true);
  });

  it.each(["/", "/robots.txt", "/sitemap.xml", "/opengraph-image", "/icon.svg"])(
    "LAND-01 LAND-07 %s is public (exact match only)",
    (p) => {
      expect(isPublicPath(p)).toBe(true);
    },
  );

  it.each([
    "/dashboard",
    "/settings",
    "/connect",
    "/sign-inx",
    "/auth/sign-out",
    "/api/extension/link",
    "/robots.txt/x",
    "/opengraph-image/x",
  ])("AUTH-03 %s requires a session", (p) => {
    expect(isPublicPath(p)).toBe(false);
  });
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
    "/.//evil.example",
    "/%2e//evil.example",
    "/./../..//evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
  ])("AUTH-03 LAND-02 rejects %j and falls back to /dashboard", (raw) => {
    expect(safeNextPath(raw)).toBe("/dashboard");
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
