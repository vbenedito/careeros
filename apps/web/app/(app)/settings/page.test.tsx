import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ reads: 0 }));

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
}));

import { ProblemsSetting } from "@/components/settings/problems-setting";
import SettingsPage from "./page";

function contains(node: unknown, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => contains(child, type));
  if (!isValidElement(node)) return false;
  if (node.type === type) return true;
  return Object.values(node.props as Record<string, unknown>).some((v) => contains(v, type));
}

const render = async () => SettingsPage({ searchParams: Promise.resolve({}) });

beforeEach(() => {
  state.reads = 0;
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
});
