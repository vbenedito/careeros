import { describe, expect, it } from "vitest";
import { buildCsp, createNonce, STATIC_SECURITY_HEADERS } from "./headers";

const supabaseUrl = "https://abc.supabase.co/rest/v1";

describe("buildCsp", () => {
  it("SEC-09 production: nonce scripts, no unsafe-inline/eval, no framing", () => {
    const csp = buildCsp({
      nonce: "n0nce",
      isDev: false,
      supabaseUrl,
      upgradeInsecureRequests: true,
    });
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src")) ?? "";
    expect(scriptSrc).toContain("'nonce-n0nce'");
    expect(scriptSrc).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(csp).toContain("style-src 'self' 'nonce-n0nce'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("SEC-09 the browser may only call itself and the Supabase origin", () => {
    const csp = buildCsp({ nonce: "x", isDev: false, supabaseUrl, upgradeInsecureRequests: true });
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co;");
  });

  it("development allows eval for React debugging", () => {
    const csp = buildCsp({ nonce: "x", isDev: true, supabaseUrl, upgradeInsecureRequests: false });
    expect(csp).toContain("'unsafe-eval'");
  });

  it("http sites (localhost production builds) do not upgrade requests to https", () => {
    const csp = buildCsp({ nonce: "x", isDev: false, supabaseUrl, upgradeInsecureRequests: false });
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
  });
});

describe("form-action", () => {
  it("AUTH-01 allows the OAuth redirect chain: self -> Supabase -> Google/GitHub, nothing else", () => {
    const csp = buildCsp({ nonce: "x", isDev: false, supabaseUrl, upgradeInsecureRequests: true });
    expect(csp).toContain(
      "form-action 'self' https://abc.supabase.co https://accounts.google.com https://github.com;",
    );
  });
});

describe("createNonce", () => {
  it("is random base64 of 16 bytes", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });
});

describe("static headers", () => {
  it("SEC-09 deny framing and sniffing", () => {
    const keys = Object.fromEntries(STATIC_SECURITY_HEADERS.map((h) => [h.key, h.value]));
    expect(keys["X-Frame-Options"]).toBe("DENY");
    expect(keys["X-Content-Type-Options"]).toBe("nosniff");
    expect(keys["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
