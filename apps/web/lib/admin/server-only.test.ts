import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path: string) => readFileSync(join(webRoot, path), "utf8");

/** Every source file under a folder of the web app, relative to it. */
function sources(dir: string): string[] {
  return readdirSync(join(webRoot, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(join(dir, e.name))
      : /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
}

describe("ledger token stays on the server (ADM-08, SEC-07)", () => {
  it("ADM-08 the modules that read the ledger import server-only", () => {
    for (const file of ["lib/admin/github.ts", "lib/admin/ledger.ts", "lib/admin/guard.ts"]) {
      expect(read(file), file).toMatch(/^import "server-only";$/m);
    }
  });

  it("ADM-08 no admin file is a client component", () => {
    for (const file of [...sources("app/admin"), ...sources("lib/admin")]) {
      expect(read(file), file).not.toMatch(/^["']use client["']/m);
    }
  });

  it("ADM-08 the token is read in one place, and never as NEXT_PUBLIC_", () => {
    const all = [
      ...sources("app"),
      ...sources("lib"),
      ...sources("components"),
      "proxy.ts",
      "next.config.ts",
    ];
    const readers = all.filter((f) => /process\.env\.OPS_LEDGER_TOKEN/.test(read(f)));
    expect(readers).toEqual(["lib/env.ts"]);
    // env-check.ts names the forbidden variable to reject it; nothing else may.
    const publicTwin = all.filter((f) => read(f).includes("NEXT_PUBLIC_OPS_LEDGER_TOKEN"));
    expect(publicTwin).toEqual(["lib/env-check.ts"]);
  });

  it("ADM-08 the token is never logged", () => {
    for (const file of [...sources("lib/admin"), ...sources("app/admin")]) {
      expect(read(file), file).not.toMatch(/console\.|logServerError/);
    }
  });

  it("ADM-03 ADM-04 the admin pages are noindex, unlinked and read-only", () => {
    expect(read("app/admin/layout.tsx")).toContain("index: false");
    expect(read("app/sitemap.ts")).not.toContain("admin");
    const links = sources("components").filter((f) => /["'`]\/admin\b/.test(read(f)));
    expect(links).toEqual([]);
    for (const file of sources("app/admin")) {
      expect(read(file), file).not.toMatch(/<form|<button|method:\s*["'](POST|PUT|PATCH|DELETE)/);
    }
  });

  it("ADM-16 GitHub is read with plain fetch: no GitHub client library", () => {
    const manifest = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(Object.keys(manifest.dependencies).filter((d) => /octokit|github/i.test(d))).toEqual([]);
    expect(read("lib/admin/github.ts")).toContain("fetch");
  });
});
