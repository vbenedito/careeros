# Security & edge-case review — v0

Issue #30 · SEC §5 item 4 · 2026-11-07

Two independent reviews ran on `main` at `8bd9855`. Neither author wrote the code under review:

- **Security** (grill:security agent): auth handoff (link route, `externally_connectable`, external and internal message handlers, extension session storage), RPCs, RLS and grants, dashboard routes, CSRF, CSP, secrets and logging.
- **Edge cases** (grill:edge-cases agent): lost or double-counted time (worker restarts, sleep, clock changes, midnight/DST, retries, token refresh, disconnect during sync) and dashboard totals.

**Result: no High-severity findings.** An independent review of the fixes themselves found a regression in the first E1 fix (a 429 after expiry lost the "Reconnect" prompt). It is corrected and covered by a test that runs the real supabase-js client.

## Findings and disposition

| # | Severity | Finding | Disposition |
|---|---|---|---|
| S1 | Low | Connecting a *different* user cleared the previous user's local data only when unsynced intervals remained. Today's totals and the quarantine stayed visible in a shared Chrome profile. | **Fixed** (#30): the data is always cleared when the owner changes; unsynced intervals still need the explicit discard (AUTH-11). Test: `AUTH-11 SEC-01 synced data of the previous user is cleared…` |
| E1 | Medium | The review reported that a 429 or 500 from Supabase Auth during a token refresh counted as a revoked session, which signed the extension out and stopped tracking. | **Partly fixed** (#30). Checked against auth-js: a 500 is already retried as a network error. A 429/408 *before* the access token expires (a proactive refresh) now stays connected. Once the token has expired, supabase-js deletes the stored session itself; the extension then shows "Reconnect" (AUTH-11) instead of a silent "not connected". Tests: `refresh failures (AUTH-11)`, `refresh against a rate-limited server (AUTH-11)`. Avoiding that reconnect entirely would mean working around supabase-js: backlog #83. |
| E2 | Medium | A device clock more than 5 min fast gets every interval rejected (`ended_at > now() + 5 min`) and quarantined for good. | Backlog #83: needs a badly wrong clock; the data stays visible as "not synced". |
| E3 | Low | A slot that timed out (10 s) could still commit late, outside the serialized queue. | **Fixed** (#30): a timed-out slot never touches storage again. Test: `TRK-17 an observation arriving after its slot timed out is never stored` |
| E4 | Low | Disconnect during a running sync cycle can report unsynced data for under a second; retrying works. | Backlog #83 |
| E5 | Low | An interval crossing the viewer's midnight counts on its start day when device and viewer zones differ. | As specified (DATA-10); noted in #83 |

## Checked and sound (summary)

- **Link route:** Origin check against the configured site URL, `getUser()` (a revoked session cannot mint tokens), rate limit in Postgres, the token signs in as the caller only, `no-store`, never logged, 300 s expiry.
- **Extension external messaging:** one dashboard origin, other extensions refused, Zod-validated payloads, no account swap while connected.
- **Internal messaging:** requires the extension's own id and page URL; no content scripts.
- **SECURITY DEFINER functions:** `search_path = ''`, act on `auth.uid()` only, `EXECUTE` revoked from public and anon.
- **RLS:** forced on every table; inserts scoped to the `domain` column; ingest idempotent and owner-checked.
- **Dashboard routes:** every mutating route checks Origin (SEC-08); account deletion deletes only the caller; safe `next` redirects; PKCE.
- **CSP:** nonce + `strict-dynamic`, `frame-ancestors 'none'`, HSTS in production. Radix's scroll-lock styles carry the nonce (fixed in #29).
- **Secrets:** the secret key is server-only; extension builds refuse non-publishable keys.
- **Logs:** carry no tokens, emails or untracked hosts (SEC-06).
- **Tracking engine:** step and outbox committed in one write; gap and clock-back rules; computed boundaries; DST-tested; idempotent retries.

## Accepted residual risks

- After account deletion, already-issued access tokens stay valid until expiry (≤ 1 h, AUTH-13); writes fail on the foreign key.
- XSS on the dashboard could drive the extension's connect/disconnect (ADR-0003).

## Other SEC §5 criteria

1. The manifest permission set equals SEC-03: `apps/extension/manifest.config.test.ts`.
2. After a scripted browsing session, storage holds no URL path or untracked host: `apps/extension/tests/e2e/tracking.e2e.test.ts`.
3. pgTAP cross-user tests pass in CI (`supabase/tests/database/020_rls.test.sql`).
