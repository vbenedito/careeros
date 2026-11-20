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

  it("TEST-01 the CI-only OPS_GITHUB_API_STUB fails the production build", () => {
    expect(names({ ...valid, OPS_GITHUB_API_STUB: "http://127.0.0.1:4010" })).toEqual([
      "OPS_GITHUB_API_STUB",
    ]);
  });

  it("ADM-08 OPS_LEDGER_TOKEN is optional; a NEXT_PUBLIC_ twin fails the build", () => {
    expect(productionEnvProblems(valid)).toEqual([]);
    expect(productionEnvProblems({ ...valid, OPS_LEDGER_TOKEN: "github_pat_x" })).toEqual([]);
    expect(names({ ...valid, NEXT_PUBLIC_OPS_LEDGER_TOKEN: "github_pat_x" })).toEqual([
      "NEXT_PUBLIC_OPS_LEDGER_TOKEN",
    ]);
  });

  it("ENV-05c EXTENSION_STORE_VERSION is optional: missing, empty and major.minor.patch pass", () => {
    for (const value of [undefined, "", "0.2.3", " 0.3.0 "]) {
      expect(productionEnvProblems({ ...valid, EXTENSION_STORE_VERSION: value })).toEqual([]);
    }
  });

  it("ENV-05c an invalid EXTENSION_STORE_VERSION fails the build check without echoing it", () => {
    for (const value of ["latest-secret", "9.9", "v9.9.9", "9.9.9-beta"]) {
      const problems = productionEnvProblems({ ...valid, EXTENSION_STORE_VERSION: value });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/^EXTENSION_STORE_VERSION must be/);
      expect(problems[0]).not.toContain(value);
    }
  });
});
