import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  setting: "off" as "on" | "off" | "unknown",
  settingReads: 0,
  listReads: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "UTC" }) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({}),
  getCurrentUser: async () => ({ id: "u1", email: "a@example.test" }),
}));
vi.mock("@/lib/dashboard/data", () => ({
  loadDashboard: async () => ({
    ok: true,
    data: { periodSeconds: 600, daily: [], domains: [] },
  }),
}));
vi.mock("@/lib/problems/data", () => ({
  loadProblemSetting: async () => {
    state.settingReads += 1;
    return state.setting;
  },
  loadProblems: async () => {
    state.listReads += 1;
    return { ok: true, rows: [] };
  },
}));

import { ProblemsAnnouncement } from "@/components/dashboard/problems-announcement";
import { ProblemsCard } from "@/components/dashboard/problems-card";
import DashboardPage from "./page";

/** True when the element tree (children and element-valued props) contains `type`. */
function contains(node: unknown, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => contains(child, type));
  if (!isValidElement(node)) return false;
  if (node.type === type) return true;
  return Object.values(node.props as Record<string, unknown>).some((v) => contains(v, type));
}

const render = async () => DashboardPage({ searchParams: Promise.resolve({}) });

beforeEach(() => {
  state.setting = "off";
  state.settingReads = 0;
  state.listReads = 0;
});
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_EXTENSION_ID", "a".repeat(32)));

describe("dashboard page release flag (PRB-23, DASH-17, DASH-18)", () => {
  it("PRB-23 store version 0.2.3: no announcement, no problems card, no problem reads (setting off)", async () => {
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.2.3");
    const page = await render();
    expect(contains(page, ProblemsAnnouncement)).toBe(false);
    expect(contains(page, ProblemsCard)).toBe(false);
    expect(state.settingReads + state.listReads).toBe(0);
  });

  it("PRB-23 store version 0.2.3: no card either when the stored setting is on", async () => {
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.2.3");
    state.setting = "on";
    const page = await render();
    expect(contains(page, ProblemsCard)).toBe(false);
    expect(contains(page, ProblemsAnnouncement)).toBe(false);
    expect(state.settingReads + state.listReads).toBe(0);
  });

  it("PRB-23 a missing store version behaves like 0.2.3", async () => {
    vi.stubEnv("EXTENSION_STORE_VERSION", undefined);
    const page = await render();
    expect(contains(page, ProblemsAnnouncement)).toBe(false);
    expect(contains(page, ProblemsCard)).toBe(false);
  });

  it("PRB-23 store version 0.3.0, setting off: the announcement shows, the card does not (DASH-18)", async () => {
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.3.0");
    const page = await render();
    expect(contains(page, ProblemsAnnouncement)).toBe(true);
    expect(contains(page, ProblemsCard)).toBe(false);
  });

  it("PRB-23 store version 0.3.0, setting on: the card shows, the announcement does not (DASH-17)", async () => {
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.3.0");
    state.setting = "on";
    const page = await render();
    expect(contains(page, ProblemsCard)).toBe(true);
    expect(contains(page, ProblemsAnnouncement)).toBe(false);
  });
});
