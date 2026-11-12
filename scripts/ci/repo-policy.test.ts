import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("repository policy checks", () => {
  it("SEC-12 the lockfile is committed and Dependabot watches npm and GitHub Actions", () => {
    expect(existsSync(resolve(root, "pnpm-lock.yaml"))).toBe(true);
    const dependabot = read(".github/dependabot.yml");
    expect(dependabot).toContain("package-ecosystem: npm");
    expect(dependabot).toContain("package-ecosystem: github-actions");
  });

  it("STORE-04 the listing's privacy policy URL is the dashboard's /privacy page", () => {
    expect(existsSync(resolve(root, "apps/web/app/privacy/page.tsx"))).toBe(true);
    const urls = read("docs/chrome-web-store/listing.md").match(
      /Privacy policy(?: URL)?:\*{0,2}\s*(\S+)/g,
    );
    expect(urls?.length).toBeGreaterThan(0);
    for (const line of urls ?? []) expect(line).toMatch(/\/privacy$/);
  });
});
