import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertNoSecrets,
  type BuildMode,
  buildManifest,
  EXTENSION_PAGES_CSP,
  MANIFEST_KEYS,
  parseDashboardOrigin,
  parseSupabaseConfig,
  STORE_DESCRIPTION,
  storeManifest,
} from "./manifest.config";

const config = { dashboardOrigin: "http://localhost:3000", version: "0.1.0" };

/** Chrome derives the extension ID from the SHA-256 of the DER public key (first 32 hex → a–p). */
function idFromKey(base64Key: string): string {
  const hex = createHash("sha256").update(Buffer.from(base64Key, "base64")).digest("hex");
  return [...hex.slice(0, 32)]
    .map((c) => String.fromCharCode(97 + Number.parseInt(c, 16)))
    .join("");
}

describe("manifest", () => {
  it.each<BuildMode>(["development", "production"])(
    "SEC-03 %s build requests exactly alarms, idle, storage, tabs and nothing else",
    (mode) => {
      const manifest: Record<string, unknown> = buildManifest(mode, config);
      expect([...(manifest.permissions as string[])].sort()).toEqual([
        "alarms",
        "idle",
        "storage",
        "tabs",
      ]);
      expect(manifest).not.toHaveProperty("host_permissions");
      expect(manifest).not.toHaveProperty("optional_permissions");
      expect(manifest).not.toHaveProperty("optional_host_permissions");
      expect(manifest).not.toHaveProperty("content_scripts");
      expect(manifest).not.toHaveProperty("web_accessible_resources");
    },
  );

  it("SEC-04 extension pages CSP forbids remote code and eval", () => {
    const manifest = buildManifest("production", config);
    expect(manifest.content_security_policy.extension_pages).toBe(EXTENSION_PAGES_CSP);
    expect(EXTENSION_PAGES_CSP).not.toMatch(/unsafe-eval|unsafe-inline|https?:/);
  });

  it("AUTH-06 only the configured dashboard origin may message the extension", () => {
    const manifest = buildManifest("development", config);
    expect(manifest.externally_connectable.matches).toEqual(["http://localhost:3000/*"]);
  });

  it("ENV-05 dev and prod builds have different pinned IDs matching their keys", () => {
    for (const mode of ["development", "production"] as const) {
      expect(idFromKey(MANIFEST_KEYS[mode].key)).toBe(MANIFEST_KEYS[mode].id);
    }
    expect(MANIFEST_KEYS.development.id).not.toBe(MANIFEST_KEYS.production.id);
    expect(buildManifest("development", config).key).toBe(MANIFEST_KEYS.development.key);
    expect(buildManifest("production", config).key).toBe(MANIFEST_KEYS.production.key);
  });

  it("MV3 module service worker at a stable path", () => {
    const manifest = buildManifest("production", config);
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: "background.js", type: "module" });
    expect(manifest.version).toBe("0.1.0");
  });
});

describe("parseDashboardOrigin", () => {
  it("accepts a plain origin and strips a trailing slash", () => {
    expect(parseDashboardOrigin("http://localhost:3000/", "development")).toBe(
      "http://localhost:3000",
    );
  });

  it("requires a value", () => {
    expect(() => parseDashboardOrigin(undefined, "production")).toThrow(/required/);
  });

  it("rejects paths, invalid URLs and http in production", () => {
    expect(() => parseDashboardOrigin("https://app.example.com/x", "production")).toThrow(/origin/);
    expect(() => parseDashboardOrigin("not a url", "development")).toThrow(/valid URL/);
    expect(() => parseDashboardOrigin("http://app.example.com", "production")).toThrow(/https/);
    expect(parseDashboardOrigin("https://app.example.com", "production")).toBe(
      "https://app.example.com",
    );
  });
});

describe("assertNoSecrets", () => {
  it("SEC-07 refuses to bundle a Supabase secret key", () => {
    expect(() => assertNoSecrets({ VITE_SUPABASE_KEY: "sb_secret_abc" })).toThrow(/SEC-07/);
    expect(() => assertNoSecrets({ VITE_SERVICE_ROLE_KEY: "x" })).toThrow(/SEC-07/);
    expect(() =>
      assertNoSecrets({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc" }),
    ).not.toThrow();
  });
});

describe("parseSupabaseConfig", () => {
  it("development builds may omit the key (CI builds without a Supabase stack)", () => {
    expect(
      parseSupabaseConfig({ VITE_SUPABASE_URL: "http://127.0.0.1:54321" }, "development"),
    ).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "",
    });
  });

  it("SEC-07 only publishable keys can be bundled (rejects secret and legacy JWT keys)", () => {
    for (const key of ["sb_secret_x", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x"]) {
      expect(() =>
        parseSupabaseConfig(
          { VITE_SUPABASE_URL: "http://127.0.0.1:54321", VITE_SUPABASE_PUBLISHABLE_KEY: key },
          "development",
        ),
      ).toThrow(/publishable key/);
    }
  });

  it("production builds require an https URL and a publishable key", () => {
    expect(() => parseSupabaseConfig({}, "production")).toThrow(/https/);
    expect(() =>
      parseSupabaseConfig({ VITE_SUPABASE_URL: "https://abc.supabase.co" }, "production"),
    ).toThrow(/PUBLISHABLE_KEY/);
    expect(
      parseSupabaseConfig(
        {
          VITE_SUPABASE_URL: "https://abc.supabase.co",
          VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
        },
        "production",
      ).supabaseUrl,
    ).toBe("https://abc.supabase.co");
  });
});

describe("Chrome Web Store package (STORE)", () => {
  const prod = buildManifest("production", {
    dashboardOrigin: "https://careeros.example",
    version: "0.2.1",
  });

  it("STORE-01 the store manifest has no key; everything else is the production manifest", () => {
    const store = storeManifest(prod);
    expect(store).not.toHaveProperty("key");
    const { key: _key, ...rest } = prod;
    expect(store).toEqual(rest);
  });

  it("STORE-02 the description fits the store summary (≤ 132) and claims no more than SEC-01", () => {
    expect(STORE_DESCRIPTION.length).toBeLessThanOrEqual(132);
    expect(prod.description).toBe(STORE_DESCRIPTION);
    expect(STORE_DESCRIPTION).toContain("no URLs");
  });
});
