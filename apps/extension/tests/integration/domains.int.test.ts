/**
 * Tracked-domain sync in real Chromium against local Supabase (SYNC-09..11, EXT-UI-05a).
 * The dashboard's own pages are not needed: the domain is added on the server directly, as the
 * dashboard would.
 */
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { type BrowserContext, chromium, type Page, type Worker } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOAuthUser, env, sql } from "../../../web/tests/integration/helpers";
import { MANIFEST_KEYS } from "../../manifest.config";

const DASHBOARD_URL = env("DASHBOARD_URL");
const EXTENSION_DIR = resolve(import.meta.dirname, "../../dist/development");
const EXTENSION_ID = MANIFEST_KEYS.development.id;
const CACHE_KEY = "careeros.domains.cache";

const admin = createClient(env("API_URL"), env("SECRET_KEY"), { auth: { persistSession: false } });

/** chrome.runtime.sendMessage from a page (external) or from an extension page (internal). */
const send = (page: Page, message: unknown, external: boolean) =>
  page.evaluate(
    ([id, msg, ext]) =>
      new Promise((done) => {
        const runtime = (
          globalThis as unknown as {
            chrome: { runtime: { sendMessage: (...a: unknown[]) => void } };
          }
        ).chrome.runtime;
        if (ext) runtime.sendMessage(id, msg, (r: unknown) => done(r ?? null));
        else runtime.sendMessage(msg, (r: unknown) => done(r ?? null));
      }),
    [EXTENSION_ID, message, external] as const,
  );

describe("tracked-domain sync (real Chromium)", () => {
  let context: BrowserContext;
  let worker: Worker;
  let popup: Page;
  const email = `domains-${Date.now()}@example.test`;
  let userId: string;

  const cache = () =>
    worker.evaluate(
      async (key) =>
        (await chrome.storage.local.get(key))[key] as { domains: string[] } | undefined,
      CACHE_KEY,
    );
  const serverDomains = () =>
    sql(
      `select string_agg(domain, ',' order by domain) from public.tracked_domains where user_id = '${userId}'`,
    );

  beforeAll(async () => {
    userId = createOAuthUser(email);
    sql(
      `insert into public.tracked_domains (user_id, domain) values ('${userId}', 'leetcode.com')`,
    );
    context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const dashboard = await context.newPage();
    await dashboard.goto(`${DASHBOARD_URL}/sign-in`);
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = data.properties?.hashed_token;
    expect(
      await send(dashboard, { type: "CONNECT", protocolVersion: 1, tokenHash }, true),
    ).toMatchObject({ ok: true });
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
  });

  afterAll(async () => {
    await context?.close();
  });

  it("SYNC-09 connecting loads the server list into the cache", async () => {
    await expect.poll(async () => (await cache())?.domains).toEqual(["leetcode.com"]);
  });

  it("SYNC-09 a domain added on the dashboard is picked up on refresh (popup open)", async () => {
    sql(`insert into public.tracked_domains (user_id, domain) values ('${userId}', 'neetcode.io')`);
    expect(await send(popup, { type: "DOMAINS_REFRESH" }, false)).toEqual({
      ok: true,
      domains: ["leetcode.com", "neetcode.io"],
    });
    expect((await cache())?.domains).toEqual(["leetcode.com", "neetcode.io"]);
  });

  it("SYNC-10 adding from the popup writes the normalized domain to the server", async () => {
    const reply = await send(
      popup,
      { type: "DOMAINS_ADD", input: "https://www.Docs.Python.org/3/" },
      false,
    );
    expect(reply).toMatchObject({ ok: true });
    expect(serverDomains()).toBe("docs.python.org,leetcode.com,neetcode.io");
    // Adding an existing domain is not an error.
    expect(await send(popup, { type: "DOMAINS_ADD", input: "leetcode.com" }, false)).toMatchObject({
      ok: true,
    });
  });

  it("SYNC-10 invalid input is refused without touching the server", async () => {
    expect(await send(popup, { type: "DOMAINS_ADD", input: "not a domain" }, false)).toEqual({
      ok: false,
      error: "INVALID_DOMAIN",
    });
  });

  it("SYNC-11 removing a domain removes it on the server and from the cache", async () => {
    expect(await send(popup, { type: "DOMAINS_REMOVE", domain: "neetcode.io" }, false)).toEqual({
      ok: true,
      domains: ["docs.python.org", "leetcode.com"],
    });
    expect(serverDomains()).toBe("docs.python.org,leetcode.com");
  });

  it("#94 popup controls show the pointer cursor", async () => {
    const settings = popup.getByRole("button", { name: "Settings" });
    await expect.poll(() => settings.count()).toBe(1);
    expect(await settings.evaluate((el) => getComputedStyle(el).cursor)).toBe("pointer");
  });

  it("#95 the popup's Remove buttons use the destructive colour", async () => {
    await popup.getByRole("button", { name: "Settings" }).click();
    const remove = popup.getByRole("button", { name: /^Remove / }).first();
    await expect.poll(() => remove.count()).toBe(1);
    const [color, destructive] = await remove.evaluate((el) => {
      const probe = document.body.appendChild(document.createElement("span"));
      probe.style.color = "var(--destructive)";
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return [getComputedStyle(el).color, expected];
    });
    expect(color).toBe(destructive);
    await popup.getByRole("button", { name: "Back" }).click();
  });

  it("TRK-01 the engine received the list (tracking can start)", async () => {
    const state = await worker.evaluate(
      async () =>
        (await chrome.storage.local.get("careeros.tracking.engine"))[
          "careeros.tracking.engine"
        ] as { signals: { trackedDomains: string[] | null; connected: boolean } },
    );
    expect(state.signals.connected).toBe(true);
    expect(state.signals.trackedDomains).toEqual(["docs.python.org", "leetcode.com"]);
  });
});
