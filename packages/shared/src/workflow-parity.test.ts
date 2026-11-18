/**
 * The production migration workflow installs a pinned Supabase CLI and refuses to run when it
 * differs from package.json (#206). Dependabot bumps package.json only, so this test makes the
 * drift fail CI on the Dependabot PR instead of failing the production run after a merge.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

describe("workflow parity", () => {
  it("ENV-08 migrate.yml pins the same Supabase CLI version as package.json", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      devDependencies: Record<string, string>;
    };
    const workflow = readFileSync(resolve(root, ".github/workflows/migrate.yml"), "utf8");
    const pinned = /uses: supabase\/setup-cli@[^\n]*\n\s*with:\n\s*version: (\S+)/.exec(workflow)?.[1];
    expect(pinned).toBeDefined();
    expect(pinned).toBe(pkg.devDependencies.supabase);
  });
});
