import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "test-token-not-real";
const guard = vi.hoisted(() => ({ order: [] as string[], allowed: true }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/guard", () => ({
  requireAdmin: async () => {
    guard.order.push("guard");
    if (!guard.allowed) throw new Error("NEXT_NOT_FOUND");
  },
}));
const load = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/lib/admin/ledger", () => ({
  loadLedger: async () => {
    guard.order.push("ledger");
    return load.result;
  },
}));

import AdminPage from "./page";

beforeEach(() => {
  guard.order = [];
  guard.allowed = true;
  vi.stubEnv("OPS_LEDGER_TOKEN", TOKEN);
});

/** Everything a client could receive: the element tree with its props. */
const serialized = (node: ReactNode) =>
  JSON.stringify(node, (_k, v) => (isValidElement(v) || typeof v !== "function" ? v : "[fn]"));

const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("admin page (ADM-02, ADM-08, ADM-09)", () => {
  it("ADM-02 the guard runs before the ledger is read, and a refusal reads nothing", async () => {
    load.result = { status: "ok", sessions: [], invalid: [] };
    await AdminPage();
    expect(guard.order).toEqual(["guard", "ledger"]);
    guard.order = [];
    guard.allowed = false;
    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(guard.order).toEqual(["guard"]);
  });

  it("ADM-08 ADM-09 the token is never in the page's props or markup", async () => {
    load.result = {
      status: "ok",
      invalid: ["2030/bad.json"],
      sessions: [
        {
          schema: 1,
          session: "2030-01-02-a",
          date: "2030-01-02",
          goal: "fixture",
          corrects: null,
          main: { tokens: 10, measure: "measured" },
          agents: [],
        },
      ],
    };
    const page = await AdminPage();
    expect(serialized(page)).not.toContain(TOKEN);
    const markup = html(page);
    expect(markup).not.toContain(TOKEN);
    expect(markup).toContain("2030/bad.json");
    expect(markup).toContain("measured");
    for (const form of ["<form", "<button"]) expect(markup).not.toContain(form); // ADM-04
  });

  it("ADM-08 unavailable ledger: the page says so with the HTTP status only", async () => {
    load.result = { status: "unavailable", httpStatus: 401 };
    expect(html(await AdminPage())).toContain("Ledger unavailable (HTTP 401)");
    load.result = { status: "unavailable", httpStatus: null };
    const markup = html(await AdminPage());
    expect(markup).toContain("Ledger unavailable");
    expect(markup).not.toContain("HTTP");
    expect(markup).not.toContain(TOKEN);
  });
});
