/**
 * Interval upload in real Chromium against local Supabase (SYNC-01..05, AUTH-12).
 * Intervals are placed in the outbox directly (the engine is covered by its own tests), then a
 * sync cycle is triggered through the extension's sync alarm.
 */
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { type BrowserContext, chromium, type Page, type Worker } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOAuthUser, env, sql } from "../../../web/tests/integration/helpers";
import { MANIFEST_KEYS } from "../../manifest.config";

const DASHBOARD_URL = env("DASHBOARD_URL");
const EXTENSION_DIR = resolve(import.meta.dirname, "../../dist/development");
const EXTENSION_ID = MANIFEST_KEYS.development.id;
const OUTBOX = "careeros.tracking.outbox";
const QUARANTINE = "careeros.tracking.quarantine";
const DEFERRED = "careeros.tracking.deferred";
const admin = createClient(env("API_URL"), env("SECRET_KEY"), { auth: { persistSession: false } });

const iso = (t: number) => `${new Date(t).toISOString().slice(0, 19)}Z`;
const interval = (
  deviceId: string,
  minutesAgo: number,
  overrides: Record<string, unknown> = {},
) => ({
  id: randomUUID(),
  device_id: deviceId,
  domain: "leetcode.com",
  started_at: iso(Date.now() - minutesAgo * 60_000),
  ended_at: iso(Date.now() - (minutesAgo - 5) * 60_000),
  ...overrides,
});

describe("interval sync (real Chromium)", () => {
  let context: BrowserContext;
  let worker: Worker;
  let dashboard: Page;
  const email = `sync-${Date.now()}@example.test`;
  let userId: string;
  const deviceId = randomUUID();

  const storage = <T>(key: string) =>
    worker.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key) as Promise<
      T | undefined
    >;
  const putOutbox = (items: unknown[]) =>
    worker.evaluate(async ([k, v]) => chrome.storage.local.set({ [k as string]: v }), [
      OUTBOX,
      items,
    ] as const);
  /** Fires the sync alarm now (the listener runs a cycle). */
  const triggerSync = () =>
    worker.evaluate(() => chrome.alarms.create("careeros.sync", { when: Date.now() + 50 }));
  const rows = () =>
    Number(sql(`select count(*) from public.study_sessions where user_id = '${userId}'`));
  const send = (msg: unknown) =>
    dashboard.evaluate(
      ([id, m]) =>
        new Promise((done) =>
          (
            globalThis as unknown as {
              chrome: { runtime: { sendMessage: (...a: unknown[]) => void } };
            }
          ).chrome.runtime.sendMessage(id, m, (r: unknown) => done(r ?? null)),
        ),
      [EXTENSION_ID, msg] as const,
    );

  beforeAll(async () => {
    userId = createOAuthUser(email);
    context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    dashboard = await context.newPage();
    await dashboard.goto(`${DASHBOARD_URL}/sign-in`);
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    expect(
      await send({ type: "CONNECT", protocolVersion: 1, tokenHash: data.properties?.hashed_token }),
    ).toMatchObject({ ok: true });
  });

  afterAll(async () => {
    await context?.close();
  });

  it("SYNC-01 SYNC-03 pending intervals are uploaded and leave the outbox", async () => {
    await putOutbox([interval(deviceId, 60), interval(deviceId, 50)]);
    await triggerSync();
    await expect.poll(() => rows(), { timeout: 15_000 }).toBe(2);
    await expect.poll(async () => (await storage<unknown[]>(OUTBOX))?.length).toBe(0);
  });

  it("SYNC-04 replaying an already uploaded interval creates no duplicate", async () => {
    const item = interval(deviceId, 40);
    await putOutbox([item]);
    await triggerSync();
    await expect.poll(() => rows(), { timeout: 15_000 }).toBe(3);
    await putOutbox([item]); // e.g. the worker died before removing it
    await triggerSync();
    await expect
      .poll(async () => (await storage<unknown[]>(OUTBOX))?.length, { timeout: 15_000 })
      .toBe(0);
    expect(rows()).toBe(3);
  });

  it("SYNC-05 SYNC-05a a rejected interval goes to quarantine, a future-dated one is deferred; the rest still syncs", async () => {
    // Overlaps the first uploaded interval of this device (DATA-09a): a real rejection.
    const overlap = interval(deviceId, 58, { ended_at: iso(Date.now() - 56 * 60_000) });
    // Valid locally, but the server refuses intervals ending > 5 min in the future (DATA-07):
    // deferred until the server's clock (from its Date header, through CORS) passes its end.
    const future = interval(deviceId, -20);
    await putOutbox([overlap, future, interval(deviceId, 30)]);
    await triggerSync();
    await expect.poll(() => rows(), { timeout: 15_000 }).toBe(4);
    await expect.poll(async () => (await storage<unknown[]>(QUARANTINE))?.length).toBe(1);
    const deferred = await storage<{ interval: { id: string }; retryAt: number }[]>(DEFERRED);
    expect(deferred?.map((d) => d.interval.id)).toEqual([future.id]);
    // Due once the server's clock reaches its end: ~25 minutes from now.
    expect(deferred?.[0]?.retryAt).toBeGreaterThan(Date.now() + 20 * 60_000);
  });

  it("SYNC-02c the sync status carries the new fields for the popup", async () => {
    const state = await storage<Record<string, unknown>>("careeros.sync.state");
    expect(state).toMatchObject({ syncingSince: null, lastOutcome: "ok" });
    // The device clock is right: no clock hint for the deferred interval.
    expect(state?.clockAheadMs).toBeNull();
  });

  it("AUTH-12 DISCONNECT runs the final sync, then signs out", async () => {
    // The deferred interval cannot sync for ~25 minutes: from the dashboard it blocks Disconnect.
    await putOutbox([interval(deviceId, 20)]);
    expect(await send({ type: "DISCONNECT", protocolVersion: 1 })).toMatchObject({
      ok: false,
      code: "UNSYNCED_DATA",
    });
    expect(rows()).toBe(5);
    await worker.evaluate((k) => chrome.storage.local.remove(k), DEFERRED);
    expect(await send({ type: "DISCONNECT", protocolVersion: 1 })).toEqual({
      ok: true,
      protocolVersion: 1,
    });
    expect(rows()).toBe(5);
    expect(await send({ type: "STATUS", protocolVersion: 1 })).toMatchObject({ connected: false });
  });
});
