# 02 — Authentication

Status: **Approved (2026-11-04)** · Related ADRs: 0003 (extension session handoff)

Amended 2026-11-11 (#131): AUTH-03 public paths and redirects, AUTH-07b error codes, AUTH-11 discard path, to match the code.

Amended 2026-11-12 (#58, #65, #54; review of #150): AUTH-10a temporary refresh failures never sign out; AUTH-12 waits for a running upload and the popup's confirmation counts rejected sessions (AUTH-12b); AUTH-11 a different user never sees the previous user's cached sites.

Amended 2026-11-12 (grill E1/E2/H5/A3): refresh timeout and late-answer guard (AUTH-10b); auth-lock acquire timeout (AUTH-10c); a final sync skipped because a cycle started meanwhile replies "still syncing" (AUTH-12c); forward-compatible protocol parsing, "outdated" instead of "not installed" (AUTH-07c); error kinds of unexpected failures are logged (SYNC-06b).

## 1. Objective

Self-service sign-up/sign-in with Google or GitHub on the dashboard, and a secure way to connect the extension to the same account **without** sharing the dashboard's session.

## 2. Dashboard authentication

- **AUTH-01** Sign-in page offers exactly two providers: **Google** and **GitHub**, via Supabase Auth OAuth with PKCE. Sign-in and sign-up are the same action (first login creates the account).
- **AUTH-02** Sessions are stored in HTTP-only cookies via `@supabase/ssr`. Server code authorizes with `supabase.auth.getUser()` / verified claims — never trusts unverified `getSession()` data on the server.
- **AUTH-03** All routes require a session except (`apps/web/lib/auth/routes.ts`):
  - the prefixes `/sign-in`, `/auth/callback`, `/auth/sign-in`, `/privacy` and `/fonts` (self-hosted landing fonts), each matched exactly or followed by `/…`;
  - the landing page's exact paths `/`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image`, `/icon.svg` (LAND-01/07).

  The proxy (`apps/web/proxy.ts`) applies the rules:
  - Unauthenticated page requests redirect to `/sign-in?next=<path and query>`: `307` for `GET`/`HEAD`, `303` for other methods (so a `POST` is not re-sent).
  - Unauthenticated `/api` and `/api/*` requests get `401` JSON `{ "error": "NOT_AUTHENTICATED" }`, never a redirect.
  - A signed-in visitor at `/sign-in` is redirected to `/dashboard`; at `/` to `/dashboard` with the query string kept (LAND-02).
  - `safeNextPath` honors only same-origin relative `next` values. It falls back to `/dashboard` for anything else: absolute or protocol-relative URLs, backslashes, control characters, and public paths other than `/` and `/privacy`.
- **AUTH-04** Sign-out ends the dashboard session only (`scope: 'local'`); the extension stays connected unless the user disconnects it (AUTH-12).
- **AUTH-05** An OAuth account without a verified email is rejected with a clear message (Supabase requires email for both providers; the GitHub provider requests the `user:email` scope).
- **AUTH-05a** The Supabase **email provider is disabled** (local `config.toml` and production settings): no email/password sign-up and no email login. The extension handoff (§3) still works because it uses admin-generated tokens (spike #10).

## 3. Extension connection (handoff)

The extension gets its **own** Supabase session. Sharing the dashboard's refresh token is forbidden: Supabase rotates refresh tokens and treats reuse outside a short window as theft, revoking the whole session — two clients sharing one session would log each other out.

Flow (validated by spike #10, see `docs/history/spikes/0003-auth-handoff.md`):

```
User ── clicks "Connect extension" ──▶ Dashboard page (/connect)
Dashboard page ── PING (chrome.runtime.sendMessage(EXT_ID)) ──▶ Extension
   └─ no reply ⇒ show install instructions (Chrome Web Store link, EXTENSION_INSTALL_URL; amended 2026-11-12, #133)
Dashboard page ── POST /api/extension/link (cookie session) ──▶ Dashboard server
Dashboard server ── auth.admin.generateLink(magiclink, user.email) [service role] ──▶ Supabase
   └─ returns single-use hashed token (never e-mailed)
Dashboard page ── CONNECT {tokenHash} ──▶ Extension (externally_connectable)
Extension ── verifyOtp({ token_hash, type: 'magiclink' }) ──▶ Supabase  ⇒ new, independent session
Extension ── {ok, email} ──▶ Dashboard page ⇒ "Connected as …"
```

- **AUTH-06** The extension's `manifest.json` declares `externally_connectable.matches` containing **only** the dashboard origin for that build (`http://localhost:3000/*` in dev builds, the production origin in prod builds). Its ID is pinned with a manifest `key` so the dashboard can address it (`NEXT_PUBLIC_EXTENSION_ID`).
- **AUTH-07** The extension's external message handler accepts only `PING`, `CONNECT`, `DISCONNECT`, `STATUS`; validates `sender.origin` equals the configured dashboard origin and validates payloads with Zod; anything else is ignored.
- **AUTH-07a** Every message carries `protocolVersion` (integer, starts at 1). `PING`/`STATUS` replies include the extension version and protocol version; the dashboard shows "Please update the extension" when the protocol is older than it supports.
- **AUTH-07c** *(grill A3)* Both sides read `protocolVersion` first. The extension answers a message of a version it does not support with `UNSUPPORTED_PROTOCOL` (whatever its type or fields) instead of ignoring it; a message without a valid version is ignored, and a message of a supported version must match that version's schema exactly (AUTH-07). The dashboard parses replies with non-strict schemas: fields it does not know are ignored, the known ones are still validated. A reply without a version means "not installed"; a reply of another version, or one of protocol 1 that the dashboard cannot read (e.g. an unknown error code), means **outdated** ("Please update the extension"), never "not installed". Protocol 1 replies keep exactly their fields, so released 0.2.x dashboards and extensions keep working with this build in both directions; new reply fields need a new protocol version or must be optional for every reader.
- **AUTH-07b** `CONNECT` while already connected: same user → no-op success; different user → rejected with `ALREADY_CONNECTED`; the dashboard asks the user to disconnect first. Error replies carry one of these codes (`apps/extension/src/background/messaging/external.ts`, `auth/auth-service.ts`):

| Code | When |
|---|---|
| `ALREADY_CONNECTED` | `CONNECT` while connected as a different user |
| `UNSYNCED_DATA` | `CONNECT` while another user's intervals are still pending (AUTH-11); `DISCONNECT` while intervals remain unsynced (AUTH-12) |
| `INVALID_TOKEN` | `CONNECT` with a token hash that cannot be verified (used, expired, unknown) |
| `UNSUPPORTED_PROTOCOL` | `protocolVersion` not supported by this build (AUTH-07a) |
| `INTERNAL` | Unexpected error while handling the message |

- **AUTH-08** `POST /api/extension/link` requires an authenticated session, rejects requests whose `Origin` header is not the dashboard origin, and returns only the token hash. Rate limit: 5 requests/min per user, enforced in Postgres (a `private.link_requests` log checked by a definer function), because in-memory limits do not work across serverless instances. The secret key (service role, SEC-07) exists only in server environment variables.
- **AUTH-09** The token is single-use and short-lived (expiry **300 s**, `otp_expiry`; single use and expiry confirmed by spike #10). It is never logged, persisted, or placed in a URL. It transits page JavaScript for a few seconds; the residual risk (an XSS on the dashboard origin could mint and redeem one, getting an independent session that outlives the page until "Sign out of all devices" or account deletion — worse than XSS reaching cookie-authenticated APIs, see ADR-0003) is mitigated by the strict CSP with nonces (SEC-09), no third-party scripts (SEC-15), the same-origin check and the 5/min link quota.
- **AUTH-10** **The service worker is the single owner of the extension session.** Only the worker instantiates supabase-js (popup has none, EXT-UI-05a). Sessions persist through a custom storage adapter on `chrome.storage.local` (never `localStorage`). Auto-refresh timers are disabled (they die with the worker); before each API call the worker refreshes if the access token expires within 60 s, serialized by an in-memory lock so only one refresh runs (Chrome runs a single service worker per extension; a persisted lock could not be released by a killed worker). New tokens are written to storage before use. A worker killed after a rotation but before saving is recovered by Supabase's parent-token rule (reusing the parent returns the active token).
- **AUTH-10a** *(#58)* A refresh that fails for a temporary reason — rate limit (429), timeout (408), server error, network failure — keeps the session, **also when the access token has already expired**. supabase-js deletes the stored session itself after any non-retryable refresh error once the access token expired; while the worker refreshes, those deletions are held back and applied only when the failure means the session is gone (a 4xx other than 408/429, or a missing session). The extension stays connected, the sync cycle backs off like a network error (SYNC-06) and tries again later.
- **AUTH-10b** *(grill E1)* A token refresh that has not answered after `REFRESH_TIMEOUT_S` counts as a temporary failure ("unavailable", AUTH-10a): the session is kept and the caller backs off. The request is not cancelled; if it answers later, a rotated session is stored only when the stored session is still the one the refresh started from and nothing (connect, disconnect, a rejected session) replaced or removed it since; a late removal is dropped (the next refresh finds out whether the session is really gone).
- **AUTH-10c** *(grill E1)* A caller waits at most `LOCK_TIMEOUT_S` for the worker's auth lock (AUTH-10). Then it gives up without running and the failure is temporary: a token request returns "no token" (the sync cycle backs off as offline, SYNC-06a), Disconnect changes nothing and replies `SYNC_IN_PROGRESS` (AUTH-12b), other requests answer `INTERNAL`. A holder that never finishes can therefore not block sync, Connect or Disconnect until Chrome stops the worker.

| Constant | Value |
|---|---|
| `REFRESH_TIMEOUT_S` | 15 |
| `LOCK_TIMEOUT_S` | 45 (longer than a refresh, a bounded revoke and one ingest call together) |

- **AUTH-11** If the session becomes invalid — refresh fails with an auth error, or an API call fails because the user no longer exists (auth error or foreign-key violation on ingest) — the extension clears the session, stops tracking (TRK-01), keeps unsynced intervals, and shows "Reconnect" in the popup. Pending intervals are uploaded after reconnecting **only if the same user reconnects**; if a different user tries to connect, `CONNECT` is refused with `UNSYNCED_DATA` (they belong to the previous account). The only way to discard them is **Forget local data** in the popup's Settings (AUTH-11a); after that, any account can connect. (The worker's `connect` has a `discardOtherUsersData` option, but no message exposes it.) When the previous user has no pending intervals, a different user's `CONNECT` clears that user's other local data and succeeds. The tracked-site list is dropped when the session is cleared and loaded again after reconnecting. *(#54)* Whenever a session is adopted for a user other than the recorded data owner (or with no owner recorded), any cached site list is removed before the session is stored, so the new account never sees the previous one's sites, not even until its first refresh succeeds (SYNC-09a).
- **AUTH-11a** While not connected, if the last account left anything on this computer (pending or quarantined intervals, today's totals, tracked sites), the popup's Settings offers **Forget local data**, behind a confirmation that says unsynced time is lost. It deletes all of it, the device id and the sync status, after which any account can connect. It is refused while connected (Disconnect, AUTH-12, is the way then). Every clear of local data (Disconnect, a different account connecting, Forget local data) also replaces the device id and clears the sync status, and work still in flight from before the clear (a sync cycle, a site-list refresh) writes nothing (#113).
- **AUTH-12** Disconnect is available in the popup and in dashboard Settings (sends `DISCONNECT`, same browser only). The extension first attempts a final sync; if intervals remain unsynced, the user confirms discarding them (popup) or disconnect is refused with a message (dashboard). Then it removes the local session (always, even offline), revokes it on the server best effort (bounded wait), and clears local tracking data, including the cached tracked-domain list. *(#58, #65)* Before the final sync, Disconnect waits up to `DISCONNECT_WAIT_S` for a sync cycle that is already uploading (SYNC-02b), so the final sync is not skipped and the count it reports is real. Unsynced means the outbox plus deferred intervals (SYNC-05a).
- **AUTH-12b** *(#65)* The popup's Disconnect also asks before deleting **quarantined** intervals (SYNC-05: rejected, never uploaded). Its `UNSYNCED_DATA` reply carries `pending` (the number the confirmation states: unsynced + quarantined), `unsynced` and `quarantined`. The confirmation offers **Try syncing again** (sends `DISCONNECT` again without discarding: the final sync runs again) before **Disconnect anyway** (product owner, 2026-11-12). The dashboard's Disconnect does not count quarantined intervals (they can never sync and would block it for good); they are deleted with the rest. When a sync cycle is still uploading after the wait of SYNC-02b, Disconnect changes nothing and the popup gets `{ ok: false, code: "SYNC_IN_PROGRESS" }` ("Still syncing your sessions. Try again in a moment."), not the unsynced-data warning (whose count would include sessions being uploaded right now). A Disconnect that already confirmed the discard does not wait. Protocol 1 has no such code for the dashboard: it gets `UNSYNCED_DATA`, and trying again works once the upload is done.
- **AUTH-12c** *(grill E2)* A sync cycle can start after Disconnect's wait (SYNC-02b) and before it takes the auth lock (an alarm). The final sync is then skipped (SYNC-02a) while that cycle is about to upload the very intervals Disconnect would count. Disconnect then changes nothing and replies `SYNC_IN_PROGRESS` ("still syncing"), not `UNSYNCED_DATA`, so the user is not invited to discard data that uploads seconds later. A Disconnect that already confirmed the discard goes ahead.
- **AUTH-12a** Dashboard Settings offers **"Sign out of all devices"** (`signOut({ scope: 'global' })`), which revokes every session including extensions in other browsers — the remote revocation path.
- **AUTH-13** Deleting the account deletes the auth user server-side, revoking all refresh tokens. Already-issued access tokens remain valid until expiry (≤ 1 h, Supabase default) — accepted; writes fail anyway (no user row), triggering AUTH-11.
- **AUTH-14** Deleting the account requires a **sign-in within the last 10 minutes** (security audit, product owner decision). The time comes from the access token's `amr` claim, which keeps the original sign-in time across refreshes, and **only `oauth` entries count**: a session can add fresh entries on its own (enrolling an MFA factor, or redeeming an extension-link token, which gives `otp`), so those never prove a new sign-in. Otherwise Settings offers **Sign in again with <provider>** (each provider linked to the account), which returns to the delete section; the delete route refuses a stale sign-in with `?error=reauth`. This stops a stolen or long-lived session from deleting the account on its own. It does not help when the provider itself still has the person signed in on that computer.

## 4. Fallback

Not needed: spike #10 confirmed the handoff. ADR-0003 option B (extension-side OAuth via `chrome.identity.launchWebAuthFlow`) remains documented in the ADR only.

## 5. Acceptance criteria

1. A new user can sign up with Google and with GitHub (verified manually against real providers in production setup; automated tests use a seeded local user).
2. After connecting, the extension and dashboard can each refresh independently for 24 h without logging the other out (manual soak check + unit test of storage adapter).
3. A `CONNECT` message from any other origin or extension is ignored (unit test of handler).
4. Replaying a used token hash fails.
5. Signing out of the dashboard does not disconnect the extension; disconnecting the extension does not sign out the dashboard.
