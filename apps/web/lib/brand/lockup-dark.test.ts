import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCKUP_DARK_SVG } from "./lockup-dark";

const normalize = (s: string) =>
  s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .trim();

describe("brand lockup copy (#225)", () => {
  it("LAND-07 the Open Graph lockup is the same as docs/marketing/brand/careeros-lockup-dark.svg", () => {
    const source = readFileSync(
      join(__dirname, "../../../../docs/marketing/brand/careeros-lockup-dark.svg"),
      "utf8",
    );
    expect(normalize(LOCKUP_DARK_SVG)).toBe(normalize(source));
  });
});
