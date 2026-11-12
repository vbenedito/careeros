import { describe, expect, it } from "vitest";
import { manifestViolations, zipEntryViolations } from "./store-package-lib.ts";

const expected = {
  version: "1.2.3",
  dashboardOrigin: "https://app.example.com",
  csp: "script-src 'self'; object-src 'self'",
};

const good = () => ({
  manifest_version: 3,
  name: "CareerOS",
  version: "1.2.3",
  action: { default_title: "CareerOS", default_popup: "popup.html", default_icon: {} },
  background: { service_worker: "background.js", type: "module" },
  minimum_chrome_version: "120",
  permissions: ["storage", "alarms", "idle", "tabs"],
  externally_connectable: { matches: ["https://app.example.com/*"] },
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
});

describe("#156 store manifest assertions", () => {
  it("STORE-01 accepts a good manifest", () => {
    expect(manifestViolations(good(), expected)).toEqual([]);
  });

  const bad: [string, (m: Record<string, unknown>) => void, RegExp][] = [
    [
      "a key",
      (m) => {
        m.key = "MIIB";
      },
      /`key`/,
    ],
    [
      "an extra permission",
      (m) => {
        m.permissions = ["alarms", "idle", "storage", "tabs", "history"];
      },
      /permissions/,
    ],
    [
      "a missing permission",
      (m) => {
        m.permissions = ["alarms", "idle", "storage"];
      },
      /permissions/,
    ],
    [
      "no permissions",
      (m) => {
        delete m.permissions;
      },
      /permissions/,
    ],
    [
      "host_permissions",
      (m) => {
        m.host_permissions = ["<all_urls>"];
      },
      /host_permissions/,
    ],
    [
      "optional_permissions",
      (m) => {
        m.optional_permissions = ["history"];
      },
      /optional_permissions/,
    ],
    [
      "optional_host_permissions",
      (m) => {
        m.optional_host_permissions = ["https://*/*"];
      },
      /optional_host_permissions/,
    ],
    [
      "content_scripts",
      (m) => {
        m.content_scripts = [];
      },
      /content_scripts/,
    ],
    [
      "another origin",
      (m) => {
        m.externally_connectable = { matches: ["http://localhost:3000/*"] };
      },
      /externally_connectable/,
    ],
    [
      "two origins",
      (m) => {
        m.externally_connectable = { matches: ["https://app.example.com/*", "https://x.dev/*"] };
      },
      /externally_connectable/,
    ],
    [
      "extra ids",
      (m) => {
        m.externally_connectable = { matches: ["https://app.example.com/*"], ids: ["*"] };
      },
      /only declare/,
    ],
    [
      "a wrong version",
      (m) => {
        m.version = "1.2.4";
      },
      /version/,
    ],
    [
      "a wrong minimum Chrome",
      (m) => {
        m.minimum_chrome_version = "110";
      },
      /minimum_chrome_version/,
    ],
    [
      "the dev name",
      (m) => {
        m.name = "CareerOS (dev)";
      },
      /name/,
    ],
    [
      "a changed CSP",
      (m) => {
        m.content_security_policy = { extension_pages: "script-src 'self' 'unsafe-eval'" };
      },
      /content_security_policy/,
    ],
    [
      "no CSP",
      (m) => {
        delete m.content_security_policy;
      },
      /content_security_policy/,
    ],
  ];
  it.each(bad)("fails on %s", (_name, mutate, pattern) => {
    const m = good() as Record<string, unknown>;
    mutate(m);
    const found = manifestViolations(m, expected);
    expect(found.length).toBeGreaterThan(0);
    expect(found.join("\n")).toMatch(pattern);
  });
});

describe("#156 store zip contents", () => {
  it("accepts a clean package", () => {
    expect(zipEntryViolations(["manifest.json", "background.js", "assets/popup-abc.js"])).toEqual(
      [],
    );
  });
  it("fails on source maps, env files and a missing manifest", () => {
    const v = zipEntryViolations([
      "background.js.map",
      "assets/x.js.map",
      ".env",
      ".env.production",
      "icons/a.png",
    ]);
    expect(v).toHaveLength(5);
    expect(v.join("\n")).toMatch(/source map/);
    expect(v.join("\n")).toMatch(/environment file/);
    expect(v.join("\n")).toMatch(/manifest\.json missing/);
  });
  it("does not flag .env.example-like names that are not env files", () => {
    expect(zipEntryViolations(["manifest.json", "environment.js"])).toEqual([]);
  });
});
