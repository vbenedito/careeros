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

  it("ENV-12 the smoke workflow uses no secrets and runs on Production deployments, daily and manually", () => {
    const smoke = read(".github/workflows/smoke.yml");
    expect(smoke).not.toMatch(/secrets\./);
    expect(smoke).not.toMatch(/environment:/);
    expect(smoke).toContain("deployment_status:");
    expect(smoke).toContain("schedule:");
    expect(smoke).toContain("workflow_dispatch:");
    expect(smoke).toContain("startsWith(github.event.deployment.environment, 'Production')");
  });

  it("ENV-13 the health workflow runs daily in production-backup and gates on the repository", () => {
    const health = read(".github/workflows/health.yml");
    expect(health).toContain("environment: production-backup");
    expect(health).toMatch(/cron: "\d+ \d+ \* \* \*"/);
    expect(health).toContain("github.repository == 'vbenedito/careeros'");
    expect(health).toContain("scripts/ops/db-readonly.sh scripts/ops/health.sql");
    expect(health).not.toMatch(/^\s*set -\w*x/m);
  });

  it("ENV-14 the backup workflow fails on missing configuration and the health workflow reads artifacts", () => {
    const backup = read(".github/workflows/backup.yml");
    expect(backup).not.toContain("::notice::SUPABASE_DB_URL");
    expect(backup).toContain("github.repository == 'vbenedito/careeros'");
    expect(backup).toMatch(/SUPABASE_DB_URL is not set[^\n]*\n\s+exit 1/);
    expect(read(".github/workflows/health.yml")).toContain("actions: read");
  });

  it("ENV-02 TypeScript is strict in the shared base config and Biome is the only linter", () => {
    expect(read("tsconfig.base.json")).toMatch(/"strict":\s*true/);
    expect(existsSync(resolve(root, "biome.json"))).toBe(true);
    const manifests = ["package.json", "apps/web/package.json", "apps/extension/package.json"];
    for (const path of manifests) {
      expect(read(path), path).not.toMatch(/"eslint(-|")/);
    }
  });

  it("ENV-03 Node 26 is pinned in .nvmrc and engines, and pnpm comes from packageManager", () => {
    expect(read(".nvmrc").trim()).toBe("26");
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.engines.node).toBe("26.x");
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
  });

  it("AUTH-05a the local Supabase config disables the email provider", () => {
    const config = read("supabase/config.toml");
    const section = config.match(/^\[auth\.email\]\n([\s\S]*?)(?=^\[|(?![\s\S]))/m);
    expect(section, "[auth.email] section").not.toBeNull();
    expect(section?.[1]).toMatch(/^enabled = false$/m);
  });

  it("DASH-15 no client-side data cache library is a dependency (dashboard data is read on the server)", () => {
    const deps = ["package.json", "apps/web/package.json", "packages/shared/package.json"].flatMap(
      (path) => {
        const pkg = JSON.parse(read(path));
        return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      },
    );
    for (const lib of ["swr", "@tanstack/react-query", "react-query", "@apollo/client"]) {
      expect(deps).not.toContain(lib);
    }
  });

  it("STORE-09 the store and extension icons are square PNGs at the sizes the spec lists, with an alpha channel", () => {
    const png = (path: string) => {
      const bytes = readFileSync(resolve(root, path));
      expect(bytes.subarray(1, 4).toString("latin1"), path).toBe("PNG");
      // IHDR: width and height at bytes 16 and 20, colour type at byte 25 (4 and 6 have alpha).
      return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
        colorType: bytes[25],
      };
    };
    expect(png("docs/chrome-web-store/assets/icon-128.png")).toMatchObject({
      width: 128,
      height: 128,
    });
    for (const size of [16, 32, 48, 128]) {
      const icon = png(`apps/extension/public/icons/icon-${size}.png`);
      expect(icon).toMatchObject({ width: size, height: size });
      expect([4, 6], `icon-${size}`).toContain(icon.colorType);
    }
  });

  it("ENV-09 every action in every workflow is pinned to a full commit SHA", () => {
    for (const name of ["backup", "ci", "health", "migrate", "smoke"]) {
      const text = read(`.github/workflows/${name}.yml`);
      for (const [, ref] of text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)) {
        expect(ref, `${name}.yml`).toMatch(/@[0-9a-f]{40}$/);
      }
    }
  });

  it("ENV-08 the post-migration check is read-only and the CI audits workflows and dependencies", () => {
    const check = read("scripts/ops/post-migrate-check.sql");
    expect(check).toMatch(/^set transaction read only;/m);
    expect(check).not.toMatch(/\b(insert|update|delete|truncate|drop|alter|create)\b/i);
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain("actionlint");
    expect(ci).toContain("scripts/ci/audit.ts");
    expect(read("scripts/ci/audit.ts")).toContain('"--audit-level=high"');
    expect(ci).toContain("scripts/ci/incremental-migrations.sh");
    expect(read(".github/workflows/migrate.yml")).toContain("post-migrate-check.sql");
  });
});
