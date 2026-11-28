import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ reads: 0, ruleReads: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: { claims: { email: "a@example.test", app_metadata: { provider: "google" } } },
      }),
    },
    from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }),
  }),
}));
vi.mock("@/lib/problems/data", () => ({
  loadProblemSetting: async () => {
    state.reads += 1;
    return "off";
  },
  hasStoredProblems: async () => {
    state.reads += 1;
    return false;
  },
  loadProblemSiteRules: async () => {
    state.ruleReads += 1;
    return [];
  },
}));

import { ProblemSites } from "@/components/settings/problem-sites";
import { ProblemsSetting } from "@/components/settings/problems-setting";
import SettingsPage from "./page";

function contains(node: unknown, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => contains(child, type));
  if (!isValidElement(node)) return false;
  if (node.type === type) return true;
  return Object.values(node.props as Record<string, unknown>).some((v) => contains(v, type));
}

/** The first element of `type` in the tree, so its props can be checked. */
function find(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, type);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as unknown as { props: Record<string, unknown> };
  for (const v of Object.values(node.props as Record<string, unknown>)) {
    const hit = find(v, type);
    if (hit) return hit;
  }
  return null;
}

const render = async () => SettingsPage({ searchParams: Promise.resolve({}) });

beforeEach(() => {
  state.reads = 0;
  state.ruleReads = 0;
});
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_EXTENSION_ID", "a".repeat(32)));

describe("settings page release flag (PRB-23, DASH-16)", () => {
  it("PRB-23 store version 0.2.3, empty or missing: no problems section and no problem reads", async () => {
    for (const value of ["0.2.3", "", undefined]) {
      vi.stubEnv("EXTENSION_STORE_VERSION", value);
      const page = await render();
      expect(contains(page, ProblemsSetting)).toBe(false);
    }
    expect(state.reads).toBe(0);
  });

  it("PRB-23 store version 0.3.0: the section shows as before (DASH-16)", async () => {
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.3.0");
    const page = await render();
    expect(contains(page, ProblemsSetting)).toBe(true);
    expect(state.reads).toBe(2);
  });

  it("ENV-05c PRB-22 store version 0.3.0: LeetCode-only copy and check (neetCode false)", async () => {
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.3.0");
    expect(find(await render(), ProblemsSetting)?.props.neetCode).toBe(false);
  });

  it("ENV-05c PRB-22 store version 0.3.1: coding problems copy and the per-site check", async () => {
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.3.1");
    const setting = find(await render(), ProblemsSetting);
    expect(setting?.props.neetCode).toBe(true);
    // No tracked sites in this test: a problem site is missing.
    expect(setting?.props.siteTracked).toBe(false);
  });

  it("ENV-05c PSR-21 DASH-16 problem sites show only from store version 0.4.0, with no reads before", async () => {
    for (const value of ["0.3.1", "", undefined]) {
      vi.stubEnv("EXTENSION_STORE_VERSION", value);
      expect(contains(await render(), ProblemSites)).toBe(false);
    }
    expect(state.ruleReads).toBe(0);
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.4.0");
    expect(contains(await render(), ProblemSites)).toBe(true);
    expect(state.ruleReads).toBe(1);
  });
});
