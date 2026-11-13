import { describe, expect, it } from "vitest";
import { assertProductionEnv, productionEnvProblems } from "./env-check";

const valid = {
  PRIVACY_CONTROLLER: "Jane Doe",
  PRIVACY_CONTACT_EMAIL: "privacy@example.test",
  DATA_REGION: "Sao Paulo",
  SITE_URL: "https://careeros.example",
  NEXT_PUBLIC_EXTENSION_ID: "abcdefghijklmnopabcdefghijklmnop",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  EXTENSION_INSTALL_URL:
    "https://chromewebstore.google.com/detail/careeros/abcdefghijklmnopabcdefghijklmnop",
};

const without = (name: keyof typeof valid) => ({ ...valid, [name]: undefined });
const names = (env: Record<string, string | undefined>) =>
  productionEnvProblems(env).map((p) => p.split(" ")[0]);

describe("production build validation (ENV-05b)", () => {
  it("ENV-05b accepts a complete production configuration", () => {
    expect(productionEnvProblems(valid)).toEqual([]);
    expect(() => assertProductionEnv(valid)).not.toThrow();
  });

  it("ENV-05b SITE_URL must be https", () => {
    expect(names(without("SITE_URL"))).toEqual(["SITE_URL"]);
    expect(names({ ...valid, SITE_URL: "http://careeros.example" })).toEqual(["SITE_URL"]);
    expect(names({ ...valid, SITE_URL: "not a url" })).toEqual(["SITE_URL"]);
  });

  it("ENV-05b the extension ID is 32 letters a-p", () => {
    for (const id of [
      undefined,
      "",
      "abc",
      "ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP",
      `${"a".repeat(31)}q`,
      "a".repeat(33),
    ]) {
      expect(names({ ...valid, NEXT_PUBLIC_EXTENSION_ID: id }), String(id)).toEqual([
        "NEXT_PUBLIC_EXTENSION_ID",
      ]);
    }
  });

  it("ENV-05b Supabase URL must be https and the publishable key set", () => {
    expect(names({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
    ]);
    expect(names(without("NEXT_PUBLIC_SUPABASE_URL"))).toEqual(["NEXT_PUBLIC_SUPABASE_URL"]);
    expect(names({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "  " })).toEqual([
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
  });

  it("ENV-05b the install URL must be a Chrome Web Store listing, not the search", () => {
    for (const url of [
      undefined,
      "https://chromewebstore.google.com/search/CareerOS",
      "http://chromewebstore.google.com/detail/x/abc",
      "https://evil.example/detail/x/abc",
      "https://chromewebstore.google.com.evil.example/detail/x/abc",
    ]) {
      expect(names({ ...valid, EXTENSION_INSTALL_URL: url }), String(url)).toEqual([
        "EXTENSION_INSTALL_URL",
      ]);
    }
  });

  it("ENV-05b SEC-13 the privacy settings are still required", () => {
    expect(names(without("DATA_REGION"))).toEqual(["DATA_REGION"]);
  });

  it("ENV-05b the error names every problem and points at the Vercel project and scope", () => {
    expect(() => assertProductionEnv({})).toThrow(/SITE_URL[\s\S]*EXTENSION_INSTALL_URL/);
    expect(() => assertProductionEnv({})).toThrow(/Vercel project[\s\S]*Production scope/);
  });
});
