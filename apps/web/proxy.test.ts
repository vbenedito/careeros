import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signedIn: false }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => ({ data: auth.signedIn ? { claims: { sub: "u1" } } : null }),
    },
  }),
}));

import { proxy } from "./proxy";

const request = (path: string, method = "GET") =>
  new NextRequest(`https://app.test${path}`, { method });

beforeEach(() => {
  auth.signedIn = false;
  vi.stubEnv("SITE_URL", "https://app.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
});

describe("proxy: landing query strings (SEC-15, LAND-01)", () => {
  it("SEC-15 signed-out /?code=… redirects (307) to a clean /", async () => {
    const res = await proxy(request("/?code=secret&error_description=x"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/");
  });

  it("SEC-15 keeps only utm_* parameters", async () => {
    const res = await proxy(request("/?utm_source=x&ref=me&utm_campaign=launch"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.test/?utm_source=x&utm_campaign=launch");
  });

  it("SEC-15 a clean or utm-only landing URL is served, with no CSP from the proxy (LAND-06)", async () => {
    for (const path of ["/", "/?utm_source=x"]) {
      const res = await proxy(request(path));
      expect(res.status, path).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("content-security-policy")).toBeNull();
    }
  });

  it("LAND-02 a signed-in visitor still goes to /dashboard with the query kept", async () => {
    auth.signedIn = true;
    const res = await proxy(request("/?view=week"));
    expect(res.headers.get("location")).toBe("https://app.test/dashboard?view=week");
  });

  it("SEC-15 other paths and methods are not rewritten", async () => {
    expect((await proxy(request("/privacy?x=1"))).status).toBe(200);
    expect((await proxy(request("/?code=1", "POST"))).status).not.toBe(307);
  });
});
