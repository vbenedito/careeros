/**
 * The extension's side of the connection, in real Chromium against local Supabase
 * (AUTH-06/07/07a/07b/09/10/12, SEC-03/05). Messages are sent from a page of the running
 * dashboard (DASHBOARD_URL); connect-page.int.test.ts drives the real /connect UI.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { type BrowserContext, chromium, type Page, type Worker } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MANIFEST_KEYS } from "../../manifest.config";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
};
const API_URL = env("API_URL");
const PUBLISHABLE_KEY = env("PUBLISHABLE_KEY");
const SECRET_KEY = env("SECRET_KEY");
const DB_CONTAINER = env("DB_CONTAINER");
const EXTENSION_DIR = resolve(import.meta.dirname, "../../dist/development");
const EXTENSION_ID = MANIFEST_KEYS.development.id;
const DASHBOARD_URL = env("DASHBOARD_URL");

const sql = (query: string) =>
  execFileSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-At", "-c", query],
    {
      encoding: "utf8",
    },
  ).trim();

function createOAuthUser(email: string): string {
  const id = randomUUID();
  sql(`insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
         recovery_token, email_change_token_new, email_change, email_change_token_current,
         phone_change, phone_change_token, reauthentication_token)
       values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated',
         '${email}', now(), '{"provider":"github","providers":["github"]}', '{}', now(), now(),
         '', '', '', '', '', '', '', '');
       insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at,
         updated_at, last_sign_in_at)
       values (gen_random_uuid(), '${id}', '${id}', 'github', '{"sub":"${id}","email":"${email}"}',
         now(), now(), now());
       insert into public.tracked_domains (user_id, domain) values ('${id}', 'leetcode.com');`);
  return id;
}

const admin = createClient(API_URL, SECRET_KEY, { auth: { persistSession: false } });
async function mintTokenHash(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  return data.properties.hashed_token;
}

/** Sends a message to the extension from a page, exactly like the dashboard will. */
const send = (page: Page, message: unknown) =>
  page.evaluate(
    ([id, msg]) =>
      new Promise((resolve) => {
        const runtime = (globalThis as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome
          ?.runtime;
        if (!runtime?.sendMessage) return resolve("NO_RUNTIME");
        (runtime.sendMessage as (id: string, m: unknown, cb: (r: unknown) => void) => void)(
          id as string,
          msg,
          (reply) => resolve(reply ?? null),
        );
      }),
    [EXTENSION_ID, message] as const,
  );

describe("extension connection (real Chromium)", () => {
  let context: BrowserContext;
  let worker: Worker;
  let dashboard: Page;
  const email = `ext-${Date.now()}@example.test`;

  beforeAll(async () => {
    context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    dashboard = await context.newPage();
    await dashboard.goto(`${DASHBOARD_URL}/sign-in`);
    createOAuthUser(email);
  });

  afterAll(async () => {
    await context?.close();
  });

  it("AUTH-06 the extension has the pinned development ID", () => {
    expect(new URL(worker.url()).host).toBe(EXTENSION_ID);
  });

  it("AUTH-07a PING answers with versions while not connected", async () => {
    expect(await send(dashboard, { type: "PING", protocolVersion: 1 })).toEqual({
      ok: true,
      protocolVersion: 1,
      extensionVersion: "0.1.0",
      connected: false,
    });
  });

  it("AUTH-06 SEC-05 a page on another origin cannot even reach the extension", async () => {
    const other = await context.newPage();
    // Same server, different origin (127.0.0.1 instead of localhost).
    const otherOrigin = new URL(DASHBOARD_URL);
    otherOrigin.hostname = "127.0.0.1";
    await other.goto(`${otherOrigin.origin}/sign-in`);
    expect(await send(other, { type: "PING", protocolVersion: 1 })).toBe("NO_RUNTIME");
    await other.close();
  });

  it("AUTH-07 malformed messages get no answer", async () => {
    expect(await send(dashboard, { type: "EXPORT_ALL", protocolVersion: 1 })).toBeNull();
  });

  it("AUTH-09 CONNECT with a single-use token creates the extension's own session", async () => {
    const tokenHash = await mintTokenHash(email);
    expect(await send(dashboard, { type: "CONNECT", protocolVersion: 1, tokenHash })).toEqual({
      ok: true,
      protocolVersion: 1,
      email,
    });
    expect(await send(dashboard, { type: "STATUS", protocolVersion: 1 })).toMatchObject({
      connected: true,
      email,
    });
    // Replaying the same token is refused (single use).
    expect(await send(dashboard, { type: "CONNECT", protocolVersion: 1, tokenHash })).toEqual({
      ok: false,
      code: "INVALID_TOKEN",
      protocolVersion: 1,
    });
  });

  it("AUTH-10 the session is stored in chrome.storage.local, not localStorage", async () => {
    const stored = await worker.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      return Object.keys(all);
    });
    expect(stored).toContain("careeros.auth.session");
  });

  it("SEC-03 the extension calls Supabase without host permissions (CORS) and RLS applies", async () => {
    const result = await worker.evaluate(
      async ([apiUrl, key]) => {
        const raw = (await chrome.storage.local.get("careeros.auth.session"))[
          "careeros.auth.session"
        ];
        const token = JSON.parse(raw as string).access_token as string;
        const res = await fetch(`${apiUrl}/rest/v1/tracked_domains?select=domain`, {
          headers: { apikey: key as string, authorization: `Bearer ${token}` },
        });
        return { status: res.status, body: await res.json() };
      },
      [API_URL, PUBLISHABLE_KEY] as const,
    );
    expect(result).toEqual({ status: 200, body: [{ domain: "leetcode.com" }] });
  });

  it("AUTH-07b CONNECT as a different user is refused while connected", async () => {
    const otherEmail = `other-${Date.now()}@example.test`;
    createOAuthUser(otherEmail);
    const tokenHash = await mintTokenHash(otherEmail);
    expect(await send(dashboard, { type: "CONNECT", protocolVersion: 1, tokenHash })).toEqual({
      ok: false,
      code: "ALREADY_CONNECTED",
      protocolVersion: 1,
    });
    expect(await send(dashboard, { type: "STATUS", protocolVersion: 1 })).toMatchObject({ email });
  });

  it("AUTH-12 DISCONNECT signs the extension out and revokes its session", async () => {
    const refreshToken = await worker.evaluate(async () => {
      const raw = (await chrome.storage.local.get("careeros.auth.session"))[
        "careeros.auth.session"
      ];
      return JSON.parse(raw as string).refresh_token as string;
    });
    expect(await send(dashboard, { type: "DISCONNECT", protocolVersion: 1 })).toEqual({
      ok: true,
      protocolVersion: 1,
    });
    expect(await send(dashboard, { type: "STATUS", protocolVersion: 1 })).toMatchObject({
      connected: false,
    });
    const keys = await worker.evaluate(async () =>
      Object.keys(await chrome.storage.local.get(null)),
    );
    expect(keys.filter((k) => k.startsWith("careeros.auth"))).toEqual([]);

    const client = createClient(API_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
    expect(
      (await client.auth.refreshSession({ refresh_token: refreshToken })).error,
    ).not.toBeNull();
  });
});
