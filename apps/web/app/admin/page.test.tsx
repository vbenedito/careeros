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

const repo = vi.hoisted(() => ({ result: { status: "unavailable", httpStatus: null } as unknown }));
const workflows = vi.hoisted(() => ({ result: { status: "unavailable" } as unknown }));
vi.mock("@/lib/admin/workflows", () => ({
  loadWorkflows: async () => {
    guard.order.push("workflows");
    return workflows.result;
  },
}));

vi.mock("@/lib/admin/repo", () => ({
  loadRepo: async () => {
    guard.order.push("repo");
    return repo.result;
  },
}));

import { TWO_SESSIONS } from "@/lib/admin/fixtures";
import AdminPage from "./page";

beforeEach(() => {
  guard.order = [];
  guard.allowed = true;
  repo.result = { status: "unavailable", httpStatus: null };
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
    expect(guard.order).toEqual(["guard", "ledger", "repo", "workflows"]);
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

  it("ADM-10 ADM-11 ADM-12 ADM-13 ADM-15 the page shows every panel; GitHub down leaves the ledger panels", async () => {
    load.result = { status: "ok", sessions: TWO_SESSIONS, invalid: [] };
    repo.result = { status: "unavailable", httpStatus: 403 };
    const markup = html(await AdminPage());
    for (const title of [
      "Sessions",
      "Cost per issue",
      "Agent cost",
      "Reviews",
      "v1 progress",
      "Docs Claude sees",
      "How it connects",
    ])
      expect(markup).toContain(title);
    expect(markup.replaceAll("<!-- -->", "")).toContain("GitHub unavailable (HTTP 403)");
    expect(markup.replaceAll("<!-- -->", "")).toContain("Merge state unavailable (HTTP 403)");
    expect(markup).toContain("#90");
    expect(markup).not.toContain(TOKEN);
  });

  it("ADM-12 with GitHub up the progress panel and merge states come from it", async () => {
    load.result = { status: "ok", sessions: TWO_SESSIONS, invalid: [] };
    repo.result = {
      status: "ok",
      issues: [{ number: 12, title: "Fixture open issue", state: "open", labels: ["v1"] }],
      prs: [
        {
          number: 90,
          state: "closed",
          draft: false,
          merged: true,
          body: "",
          headSha: "c".repeat(40),
        },
      ],
      checks: {},
      checksUnknown: [],
    };
    const markup = html(await AdminPage());
    expect(markup).toContain("Fixture open issue");
    expect(markup).toContain("Merged");
  });

  it("ADM-08 no ledger: every ledger panel says so, the fixed docs map and the diagram still show", async () => {
    load.result = { status: "unavailable", httpStatus: null };
    const markup = html(await AdminPage());
    expect(markup).toContain("Fixed map");
    expect(markup).toContain("How it connects");
    expect(markup).not.toContain(TOKEN);
  });
});

describe("admin overview cards (ADM-17, ADM-20)", () => {
  const okWorkflows = (conclusion: string) => ({
    status: "ok",
    inputs: ["smoke.yml", "health.yml", "backup.yml", "migrate.yml", "ci.yml", "codeql.yml"].map(
      (file) => ({
        file,
        result: {
          ok: true,
          run: { status: "completed", conclusion, updatedAt: new Date().toISOString() },
        },
      }),
    ),
  });
  const flat = (markup: string) => markup.replaceAll("<!-- -->", "");

  it("ADM-17 the four cards come first in order, then reviews, sessions, docs and the diagram", async () => {
    load.result = { status: "ok", sessions: TWO_SESSIONS, invalid: [] };
    repo.result = { status: "unavailable", httpStatus: 403 };
    workflows.result = okWorkflows("success");
    const markup = flat(html(await AdminPage()));
    const order = [
      "v1 progress",
      "Production health",
      "Agent cost",
      "Skills used",
      "Reviews",
      "Sessions",
      "Docs Claude sees",
      "How it connects",
    ].map((t) => markup.indexOf(`>${t}</h2>`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // One column below 768 px; two columns from 768 px, cost and skills across both.
    expect(markup).toContain("md:grid-cols-2");
    expect(markup.match(/md:col-span-2/g)?.length).toBe(2);
  });

  it("ADM-20 ADM-17 the freshness line sits under the title, and every Details block is closed", async () => {
    load.result = { status: "ok", sessions: TWO_SESSIONS, invalid: [] };
    repo.result = { status: "unavailable", httpStatus: 403 };
    workflows.result = okWorkflows("success");
    const markup = flat(html(await AdminPage()));
    expect(markup.indexOf("<h1")).toBeLessThan(
      markup.indexOf("GitHub data is up to 10 minutes old"),
    );
    expect(markup.indexOf("GitHub data is up to 10 minutes old")).toBeLessThan(
      markup.indexOf(">v1 progress</h2>"),
    );
    const details = markup.match(/<details[^>]*>/g) ?? [];
    expect(details.length).toBeGreaterThanOrEqual(6); // the progress card is unavailable here
    for (const d of details) expect(d).not.toContain(" open");
    for (const label of [
      "Details: tokens per day",
      "Details: checks",
      "Details: skills",
      "Details: reviews",
      "Details: sessions",
      "Details: docs Claude sees",
    ])
      expect(markup).toContain(label);
  });

  it("ADM-17 each card fails on its own: a failing source hides no other card", async () => {
    load.result = { status: "unavailable", httpStatus: 401 };
    repo.result = {
      status: "ok",
      issues: [{ number: 1, title: "Fixture", state: "closed", labels: ["v1"] }],
      prs: [],
      checks: {},
      checksUnknown: [],
    };
    workflows.result = { status: "unavailable" };
    let markup = flat(html(await AdminPage()));
    expect(markup.match(/Ledger unavailable \(HTTP 401\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(markup).toContain("1 of 1 v1 issue is done (100%)"); // progress still shows
    expect(markup).toContain("GitHub unavailable"); // health, own message
    expect(markup).toContain("How it connects");

    load.result = { status: "ok", sessions: TWO_SESSIONS, invalid: [] };
    repo.result = { status: "unavailable", httpStatus: 403 };
    workflows.result = okWorkflows("failure");
    markup = flat(html(await AdminPage()));
    expect(markup).toContain("GitHub unavailable (HTTP 403)"); // progress
    expect(markup).toContain("6 of 6 need attention"); // health still shows
    expect(markup).toContain("Agent cost");
    expect(markup).not.toContain("Ledger unavailable");
  });
});
