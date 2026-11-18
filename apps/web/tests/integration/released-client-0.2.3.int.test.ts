/**
 * ADR-0011 compatibility plan item 4 (PRB acceptance 6): the sync client of the released
 * extension 0.2.3 (frozen in fixtures/extension-0.2.3-sync.ts) keeps syncing against the
 * database with ingest v2 (#178). It still calls `ingest_study_sessions` and accepts only an
 * array of ids; an invalid and an overlapping element must end in quarantine, the valid ones
 * confirmed, and no sync error.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createSupabaseIngest, type Interval, outcomeOf } from "./fixtures/extension-0.2.3-sync";
import { createOAuthUser, env, retryOn429, sql } from "./helpers";

const API_URL = env("API_URL");

async function accessTokenFor(email: string): Promise<string> {
  const admin = createClient(API_URL, env("SECRET_KEY"), { auth: { persistSession: false } });
  const link = await retryOn429(() => admin.auth.admin.generateLink({ type: "magiclink", email }));
  if (link.error) throw link.error;
  const client = createClient(API_URL, env("PUBLISHABLE_KEY"), { auth: { persistSession: false } });
  const verified = await retryOn429(() =>
    client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" }),
  );
  if (verified.error || !verified.data.session) throw verified.error ?? new Error("no session");
  return verified.data.session.access_token;
}

const iso = (ms: number) => `${new Date(ms).toISOString().slice(0, 19)}Z`;

describe("released extension 0.2.3 against ingest v2 (integration)", () => {
  it("DATA-06 DATA-09a DATA-06b the 0.2.3 client confirms valid ids, quarantines invalid and overlapping ones, no sync error", async () => {
    const email = `released-0-2-3-${Date.now()}@example.test`;
    const userId = createOAuthUser(email);
    const token = await accessTokenFor(email);
    // The user has the problem setting on: 0.2.3 must still get the old contract.
    sql(`insert into public.account_settings (user_id, track_problems) values ('${userId}', true)`);

    const device = randomUUID();
    const start = Date.now() - 3 * 3600_000;
    const at = (minutes: number) => iso(start + minutes * 60_000);
    const valid1: Interval = {
      id: randomUUID(),
      device_id: device,
      domain: "leetcode.com",
      started_at: at(0),
      ended_at: at(10),
    };
    // DATA-02: zero length is invalid.
    const invalid: Interval = { ...valid1, id: randomUUID(), started_at: at(20), ended_at: at(20) };
    // DATA-09a: overlaps valid1 on the same device.
    const overlapping: Interval = {
      ...valid1,
      id: randomUUID(),
      started_at: at(5),
      ended_at: at(15),
    };
    const valid2: Interval = { ...valid1, id: randomUUID(), started_at: at(30), ended_at: at(40) };
    const batch = [valid1, invalid, overlapping, valid2];

    const ingest = createSupabaseIngest({
      supabaseUrl: API_URL,
      publishableKey: env("PUBLISHABLE_KEY"),
    });
    const result = await ingest(batch, token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.serverNow).not.toBeNull();
    expect(outcomeOf(batch, result)).toEqual({
      kind: "settled",
      confirmed: [valid1.id, valid2.id],
      deferred: [],
      quarantined: [invalid.id, overlapping.id],
    });

    // A retry of the same batch (e.g. after a timeout) gives the same answer and stores nothing new.
    const retry = await ingest(batch, token);
    expect(retry.ok && [...retry.confirmedIds].sort()).toEqual([valid1.id, valid2.id].sort());
    expect(sql(`select count(*) from public.study_sessions where user_id = '${userId}'`)).toBe("2");
    // The old RPC never stores a slug (DATA-06b).
    expect(
      sql(`select count(*) from public.study_session_problems where user_id = '${userId}'`),
    ).toBe("0");
  });
});
