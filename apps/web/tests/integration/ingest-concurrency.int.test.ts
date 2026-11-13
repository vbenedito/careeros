/**
 * ingest_study_sessions under concurrency against the real local Supabase stack (grill T5).
 * The extension retries a batch after a timeout, so the same batch can reach the database twice
 * at once; the per-user lock and ON CONFLICT (id) DO NOTHING must leave exactly one row per id.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createOAuthUser, env, retryOn429, sql } from "./helpers";

const API_URL = env("API_URL");
const PARALLEL_CALLS = 12;
const BATCH_SIZE = 8;

async function signedInClient(email: string) {
  const admin = createClient(API_URL, env("SECRET_KEY"), { auth: { persistSession: false } });
  const link = await retryOn429(() => admin.auth.admin.generateLink({ type: "magiclink", email }));
  if (link.error) throw link.error;
  const client = createClient(API_URL, env("PUBLISHABLE_KEY"), { auth: { persistSession: false } });
  const verified = await retryOn429(() =>
    client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" }),
  );
  if (verified.error) throw verified.error;
  return client;
}

const iso = (ms: number) => `${new Date(ms).toISOString().slice(0, 19)}Z`;

describe("ingest_study_sessions concurrency (integration)", () => {
  it("TEST-05 DATA-08 parallel identical batches leave exactly one row per id", async () => {
    const email = `ingest-race-${Date.now()}@example.test`;
    const userId = createOAuthUser(email);
    const client = await signedInClient(email);

    // Distinct, non-overlapping 5-minute intervals of one device, ending in the past.
    const device = randomUUID();
    const start = Date.now() - 3 * 3600_000;
    const batch = Array.from({ length: BATCH_SIZE }, (_, i) => ({
      id: randomUUID(),
      device_id: device,
      domain: "leetcode.com",
      started_at: iso(start + i * 10 * 60_000),
      ended_at: iso(start + i * 10 * 60_000 + 5 * 60_000),
    }));
    const ids = batch.map((s) => s.id).sort();

    const replies = await Promise.all(
      Array.from({ length: PARALLEL_CALLS }, () =>
        client.rpc("ingest_study_sessions", { sessions: batch }),
      ),
    );

    // Every call succeeds and confirms every id (new or already stored by a parallel call).
    for (const reply of replies) {
      expect(reply.error).toBeNull();
      expect([...(reply.data as string[])].sort()).toEqual(ids);
    }
    // The database holds exactly one row per id, none duplicated, none missing.
    expect(
      sql(`select count(*) || ':' || count(distinct id) from public.study_sessions
           where user_id = '${userId}'`),
    ).toBe(`${BATCH_SIZE}:${BATCH_SIZE}`);
    expect(
      sql(`select count(*) from public.study_sessions
           where user_id = '${userId}' and id = any('{${ids.join(",")}}'::uuid[])`),
    ).toBe(`${BATCH_SIZE}`);
  });
});
