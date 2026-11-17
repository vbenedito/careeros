# ADR-0011 — Versioned ingest RPC next to the current one

Status: Proposed · Date: 2026-11-17 · Issue: #176 · Implementation: #178 (database), #179 (extension)

## Context
v1 needs three changes to interval upload, in one ingest change (discovery D21):
- **Problem slug** (PRB-08, PRB-10): an interval may carry a LeetCode problem slug, stored only when the account setting is on (DATA-13, DATA-14).
- **Grill E3**: a same-device overlap (DATA-09a, e.g. after the clock moved back, TRK-15) is skipped silently. The client cannot tell it from an invalid row, so it is quarantined, and a batch of only overlaps trips the SYNC-05b "server bug" backoff (1 h, "Sync error").
- **Grill E5**: the abuse caps (DATA-09) refuse a call even when every element is a retry of a stored row, so a long offline backlog can stall at the cap.

Constraints:
- Released extension **0.2.3** and older store builds call `ingest_study_sessions(sessions jsonb)`. They accept a success **only when the body is an array** of ids (SYNC-05a "server time source"). Store updates are automatic, but not instant. Some installs stay old for weeks. A change to the reply type would turn every upload of an old extension into a sync error.
- The function is the only write path (DATA-05, ADR-0004); it runs `SECURITY DEFINER` and uses `auth.uid()` only.
- SYNC-05a guesses "future" rejections from the `Date` header, because the reply could not carry more.

## Options
1. **Change `ingest_study_sessions` in place** (new key in elements, same `uuid[]` reply). The slug fits (old clients never send it). E3 does not: the reply cannot say why an id is missing. Breaks nothing, solves only part.
2. **Change the reply of `ingest_study_sessions` to an object.** Solves everything for new clients; breaks every released extension at once. Rejected.
3. **New function `ingest_study_sessions_v2(sessions jsonb) → jsonb` next to the current one.** New clients get reasons per id and the slug; old clients keep the old contract. Two functions to keep in step; the old one is removed later.
4. **A version field in the payload** (`{"version":2,…}`) with one function. Same reply-type problem as option 2 for one SQL function (one return type); PostgREST cannot pick a reply type by input.
5. **Edge Function v2.** Another service and cold starts (ADR-0004 rejected it for the same reasons).

## Decision
Option 3.

- `ingest_study_sessions_v2` returns `{"confirmed": [uuid], "rejected": [{"id": uuid, "reason": "invalid" | "future" | "overlap"}]}` (DATA-06b). It accepts an optional `problem` per element and stores it only when the caller's setting is on at call time (DATA-14). A `problem` that fails the pattern, or on an element whose domain is not `leetcode.com`, makes only that element `invalid`; the batch goes on.
- Both functions share **one** private implementation (`private.ingest_sessions(sessions jsonb, keep_problem boolean)` returning confirmed ids and reasons). `ingest_study_sessions` is a thin wrapper that returns only the confirmed ids and never keeps a slug. So validation, locking, caps and overlap rules cannot drift apart.
- **E5** (DATA-09b) is in the shared code, so it applies to both: a batch of pure retries is confirmed at the cap. The reply type of the old function does not change, so this is safe for 0.2.3.
- **E3** is client-visible only in v2. The extension from 0.3.0 **drops** `overlap` rejections and counts their time apart (product owner, 2026-11-17): their time is already stored. The popup shows that time in one line. Overlap and `future` rejections never count for the SYNC-05b check (SYNC-05c). With 0.2.3 the old behaviour stays until the user updates.
- The extension from 0.3.0 calls only v2. There is no fallback to v1 in the client: the database migration ships before the extension release (#178 before #182), so v2 always exists for it.
- **Where slugs live:** in a separate table `study_session_problems (session_id → study_sessions.id, user_id, problem_slug)` (DATA-16), not in a column of `study_sessions`. The product owner wants the problem history deletable while all study time stays (PRB-16). A column would need an `UPDATE` path on `study_sessions`, which is immutable by design (DATA-03, ADR-0004); even a narrow definer function that only clears the column would weaken that rule and need its own guards. With a table, deleting the history touches no time row, and the totals do not change. A composite FK `(session_id, user_id, domain)` → `study_sessions(id, user_id, domain)` makes every slug row belong to a session of the same user on `leetcode.com`. Clients can only read their own rows. Only ingest v2 inserts rows, and only for session rows it newly inserted (a retry never re-adds a slug). Only `set_problem_tracking` (DATA-17, `SECURITY DEFINER`, `auth.uid()` only) deletes them; it turns the setting off and deletes in one transaction, under the same per-user lock as ingest. Ingest v2 reads the setting after taking that lock (DATA-14), so an upload in flight cannot add a slug after the delete.
- `ingest_study_sessions` stays until the store reports (almost) no installs below 0.3.0; its removal is a later issue with its own migration.

## Consequences
+ Released extensions keep syncing unchanged; no forced update.
+ One shared implementation: a rule changes in one place and is tested once.
+ v2 says why each id was rejected, so the client stops guessing (overlaps, future rows); SYNC-05a can use the reason and keep the `Date` header only for the skew.
+ The slug guard is on the server (DATA-14), not only in the extension.
− Two public RPCs until the old one is removed; both need grants (`authenticated` only) and pgTAP tests.
− One more table and a join in `get_problem_totals`; ingest v2 writes two tables in one transaction.
− The composite FK needs a new `UNIQUE (id, user_id, domain)` index on `study_sessions`. It is built with a plain `CREATE` in the migration, because `supabase db push` (`migrate.yml`) runs each migration in a transaction and `CREATE INDEX CONCURRENTLY` cannot run inside one. The table is small today (single-digit users), so the write lock is short. If the table grows, such an index needs a separate non-transactional step (see grill [A6](../history/grill-report-2026-11-12.md#architecture-v1-readiness)).
− A slug sent while the setting is off is dropped silently; intervals recorded while on but uploaded after turning off lose their slug (privacy first, PRB-16).
− One more migration on the ingest path: Opus deep review (D21).

## Compatibility test plan
1. **pgTAP, old contract:** `ingest_study_sessions` returns `uuid[]`; same results as before for valid, invalid, future, overlap and retry elements; a `problem` key is ignored and no slug is stored.
2. **pgTAP, v2:** reply shape; each reason (`invalid`, `future`, `overlap`); idempotent retries; slug stored only with the setting on; invalid slug → `invalid`; slug on a non-`leetcode.com` row → `invalid`; same auth, size and cap errors as v1.
3. **pgTAP, shared rules:** a batch sent through v1 then retried through v2 (and the other way) inserts once and is confirmed by both; caps count rows from both; E5: a batch of pure retries is confirmed at the cap through both functions, a batch with one new row is refused.
4. **Released-client contract test:** the sync client of extension 0.2.3 (its response parsing, copied as a fixture from the code released as 0.2.3, the manifest version on `main` before #179; there is no git tag for it) runs against the new database in the integration suite and syncs a batch with an invalid and an overlapping element: valid ids confirmed, the others quarantined, no sync error.
5. **Extension unit tests (0.3.0):** `future` is deferred, `invalid` is quarantined, `overlap` is dropped and its time added to the counter (SYNC-05c); a batch of only overlaps does not back off and shows no "Sync error".
6. **Grants:** `anon` cannot call either function; `authenticated` can call both.
7. **pgTAP, history delete:** `set_problem_tracking(false, true)` removes every `study_session_problems` row of the caller only (not another user's), leaves `study_sessions` and all totals unchanged; `(false, false)` keeps the rows; `(true, true)` is refused; a client cannot insert, update or delete `study_session_problems` directly; a slug row for another user's session or a non-`leetcode.com` session is refused by the FK and CHECK; a retried interval never re-adds a deleted slug.
