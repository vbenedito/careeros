/**
 * E2E (b): extension smoke in real Chromium (TEST §2) — the unpacked development build tracks
 * time on a local test page served under a tracked test domain, the popup shows it, and the
 * outbox syncs to local Supabase. Nothing is injected into the engine: real tab, focus and idle
 * signals drive it (TRK-01..04, TRK-08/10, EXT-UI-03/04, SYNC-01).
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { type BrowserContext, chromium, type Page, type Worker } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearOfMidnight,
  createOAuthUser,
  env,
  MIDNIGHT_MARGIN_MS,
  sql,
} from "../../../web/tests/integration/helpers";
import { MANIFEST_KEYS } from "../../manifest.config";
import { findResponsiveViolations } from "../support/responsive";

const DASHBOARD_URL = env("DASHBOARD_URL");
const EXTENSION_DIR = resolve(import.meta.dirname, "../../dist/development");
const EXTENSION_ID = MANIFEST_KEYS.development.id;
const ENGINE = "careeros.tracking.engine";
const OUTBOX = "careeros.tracking.outbox";
/** A real-looking tracked domain, resolved to the local test server by Chromium. */
const TRACKED = "example.org";
/** Exactly one synced interval of at least 5 s (longer than MIN_INTERVAL_S). */
const SYNCED_ONCE = /^1:([5-9]|\d{2,})$/;

const admin = createClient(env("API_URL"), env("SECRET_KEY"), { auth: { persistSession: false } });

interface EngineState {
  signals: Record<string, unknown>;
  open: { domain: string } | null;
}
interface OutboxItem {
  domain: string;
  started_at: string;
  ended_at: string;
}

describe("extension smoke (E2E)", () => {
  let server: Server;
  let port: number;
  let context: BrowserContext;
  let worker: Worker;
  let userId: string;
  const email = `e2e-track-${Date.now()}@example.test`;

  const storage = <T>(key: string) =>
    worker.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key) as Promise<
      T | undefined
    >;

  /** "<rows>:<shortest duration_s>" of this user's tracked-domain sessions in the database. */
  const synced = () =>
    sql(`select count(*) || ':' || coalesce(min(duration_s), 0) from public.study_sessions
         where user_id = '${userId}' and domain = '${TRACKED}'`);

  /** Polls the engine until `ok`; on timeout fails with the engine state, to see which signal is missing. */
  async function waitForEngine(ok: (s: EngineState | undefined) => boolean, what: string) {
    const deadline = Date.now() + 30_000;
    let state: EngineState | undefined;
    while (Date.now() < deadline) {
      state = await storage<EngineState>(ENGINE);
      if (ok(state)) return state;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`engine never ${what}: ${JSON.stringify(state)}`);
  }

  beforeAll(async () => {
    // #82: the popup totals "today" from local midnight; the interval tracked below and the
    // popup check must fall on the same local day.
    await clearOfMidnight();
    server = createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><title>${req.headers.host}</title><h1>Study page</h1>`);
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    port = (server.address() as AddressInfo).port;

    userId = createOAuthUser(email);
    sql(`insert into public.tracked_domains (user_id, domain) values ('${userId}', '${TRACKED}')`);

    context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_DIR}`,
        `--load-extension=${EXTENSION_DIR}`,
        `--host-resolver-rules=MAP ${TRACKED} 127.0.0.1, MAP *.${TRACKED} 127.0.0.1`,
      ],
    });
    worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));

    // Connect the extension the way the dashboard does (CONNECT with a single-use token).
    const dashboard = await context.newPage();
    await dashboard.goto(`${DASHBOARD_URL}/sign-in`);
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const reply = await dashboard.evaluate(
      ([id, tokenHash]) =>
        new Promise((done) =>
          (
            globalThis as unknown as {
              chrome: { runtime: { sendMessage: (...a: unknown[]) => void } };
            }
          ).chrome.runtime.sendMessage(
            id,
            { type: "CONNECT", protocolVersion: 1, tokenHash },
            done,
          ),
        ),
      [EXTENSION_ID, data.properties?.hashed_token] as const,
    );
    expect(reply).toMatchObject({ ok: true });
    await dashboard.close();
  }, MIDNIGHT_MARGIN_MS + 60_000);

  afterAll(async () => {
    await context?.close();
    await new Promise((done) => server?.close(done));
  });

  it("TRK-01..04 a focused tab on a tracked domain opens an interval", async () => {
    await waitForEngine(
      (s) =>
        s?.signals.connected === true &&
        (s.signals.trackedDomains as string[] | null)?.includes(TRACKED) === true,
      "connected with the tracked list",
    );
    const study = await context.newPage();
    await study.goto(`http://practice.${TRACKED}:${port}/`);
    await study.bringToFront();
    await waitForEngine((s) => s?.open?.domain === TRACKED, `tracked ${TRACKED}`);
  });

  it("TRK-08 TRK-10 leaving the tracked site closes the interval into the outbox", async () => {
    await new Promise((r) => setTimeout(r, 7_000)); // longer than MIN_INTERVAL_S
    const study = context.pages().find((p) => p.url().includes(TRACKED)) as Page;
    await study.goto(`http://localhost:${port}/not-tracked`);
    await waitForEngine((s) => s !== undefined && s.open === null, "closed the interval");
    // #82: the closed interval may already have left the outbox — a sync can run as soon as it
    // is written (e.g. one triggered by a session write) — so it is either still queued or
    // already in the database, never lost and never both.
    const outbox = (await storage<OutboxItem[]>(OUTBOX)) ?? [];
    expect(outbox.length).toBeLessThanOrEqual(1);
    if (outbox.length === 1) {
      const [item] = outbox;
      expect(item?.domain).toBe(TRACKED);
      const seconds =
        (Date.parse(item?.ended_at ?? "") - Date.parse(item?.started_at ?? "")) / 1000;
      expect(seconds).toBeGreaterThanOrEqual(5);
    } else {
      expect(synced()).toMatch(SYNCED_ONCE);
    }
    // SEC-01: only the tracked domain is kept — never the path or the untracked host.
    const everything = JSON.stringify(await worker.evaluate(() => chrome.storage.local.get(null)));
    expect(everything).not.toContain("practice.");
    expect(everything).not.toContain("not-tracked");
    expect(everything).not.toContain("localhost");
  });

  it("EXT-UI-03 EXT-UI-04 the popup shows today's time and the site", async () => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
    await expect.poll(() => popup.getByTestId("today-total").textContent()).toBe("<1m");
    await expect
      .poll(() => popup.getByRole("region", { name: "Top sites today" }).textContent())
      .toContain(TRACKED);
    // TEST-01 (#60): the popup is a fixed 360 px page; nothing overflows it. A desktop popup is
    // clicked with a mouse, so the touch-target rule does not apply.
    await popup.setViewportSize({ width: 360, height: 600 });
    expect(
      (await findResponsiveViolations(popup)).filter((line) => !line.includes("touch target")),
    ).toEqual([]);
    await popup.close();
  });

  it("SYNC-01 the outbox syncs to Supabase", async () => {
    await worker.evaluate(() => chrome.alarms.create("careeros.sync", { when: Date.now() + 50 }));
    await expect.poll(synced, { timeout: 20_000 }).toMatch(SYNCED_ONCE);
    await expect.poll(async () => ((await storage<OutboxItem[]>(OUTBOX)) ?? []).length).toBe(0);
  });
});
