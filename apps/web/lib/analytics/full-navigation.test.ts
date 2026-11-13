import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === ".next") return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("full document navigation to credential pages (SEC-15)", () => {
  const files = ["components", "app"].flatMap((d) => sources(join(root, d)));

  it("SEC-15 no component uses next/link, so links to /connect and /settings are full loads", () => {
    const offenders = files.filter((f) => /from ["']next\/link["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("SEC-15 nothing navigates to /connect or /settings client-side (router.push/replace)", () => {
    const offenders = files.filter((f) =>
      /router\.(push|replace|prefetch)\(\s*[`"'](\/connect|\/settings)/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("SEC-15 the sidebar renders plain anchors", () => {
    const ui = readFileSync(join(root, "components/ui/sidebar.tsx"), "utf8");
    expect(ui).toMatch(/<a\s+href=\{props\.href\}/);
  });
});
