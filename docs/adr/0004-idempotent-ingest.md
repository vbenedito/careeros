# ADR-0004 — Idempotent interval ingest via client UUIDs and an RPC

Status: Accepted · Date: 2026-11-04

## Context
The extension retries uploads after network failures and service-worker termination. Retries must never duplicate time, and one bad record must not block the queue.

## Options
1. Plain PostgREST `insert` — duplicates on retry unless ids are client-side; error on any bad row fails the batch.
2. PostgREST `upsert` with `ignoreDuplicates` on client UUID — idempotent; still all-or-nothing on validation errors; returns only inserted rows.
3. **RPC `ingest_study_sessions(jsonb)`** — validates each element, skips invalid ones, inserts with `ON CONFLICT (id) DO NOTHING`, returns all ids that now exist for the caller.
4. Edge Function — same as 3 with an extra service and cold starts.

## Decision
Option 3. Clients get no `INSERT` privilege on `study_sessions`; the RPC is the only write path and runs `SECURITY DEFINER` with an empty `search_path`, using `auth.uid()` exclusively (never a caller-supplied user id). Reads stay under RLS.

## Consequences
+ Exactly-once effect; per-row rejection → local quarantine; one round-trip per batch.
+ Logic is testable with pgTAP.
− Business validation partly in SQL (also in Zod on the client); duplication accepted, the database is the final authority.
