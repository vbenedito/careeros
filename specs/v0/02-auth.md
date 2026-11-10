# 02 — Authentication

Status: **Approved (2026-11-04)** · Related ADRs: 0003 (extension session handoff)

## 1. Objective

Self-service sign-up/sign-in with Google or GitHub on the dashboard, and a secure way to connect the extension to the same account **without** sharing the dashboard's session.

## 2. Dashboard authentication

- **AUTH-01** Sign-in page offers exactly two providers: **Google** and **GitHub**, via Supabase Auth OAuth with PKCE. Sign-in and sign-up are the same action (first login creates the account).
- **AUTH-02** Sessions are stored in HTTP-only cookies via `@supabase/ssr`. Server code authorizes with `supabase.auth.getUser()` / verified claims — never trusts unverified `getSession()` data on the server.
- **AUTH-03** All routes except `/sign-in`, `/auth/callback`, `/privacy` require a session; unauthenticated page requests redirect to `/sign-in?next=…` (only same-origin relative `next` values are honored); unauthenticated `/api/*` requests get `401` JSON, never a redirect.
- **AUTH-04** Sign-out ends the dashboard session only (`scope: 'local'`); the extension stays connected unless the user disconnects it (AUTH-12).
- **AUTH-05** An OAuth account without a verified email is rejected with a clear message (Supabase requires email for both providers; the GitHub provider requests the `user:email` scope).
- **AUTH-05a** The Supabase **email provider is disabled** (local `config.toml` and production settings): no email/password sign-up and no email login. The extension handoff (§3) still works because it uses admin-generated tokens (spike #10).

## 3. Extension connection (handoff)

The extension gets its **own** Supabase session. Sharing the dashboard's refresh token is forbidden: Supabase rotates refresh tokens and treats reuse outside a short window as theft, revoking the whole session — two clients sharing one session would log each other out.

Flow (validated by spike #10, see `docs/spikes/0003-auth-handoff.md`):

```
User ── clicks "Connect extension" ──▶ Dashboard page (/connect)
Dashboard page ── PING (chrome.runtime.sendMessage(EXT_ID)) ──▶ Extension
   └─ no reply ⇒ show install instructions (unpacked build)
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
- **AUTH-07b** `CONNECT` while already connected: same user → no-op success; different user → rejected with `ALREADY_CONNECTED`; the dashboard asks the user to disconnect first.
- **AUTH-08** `POST /api/extension/link` requires an authenticated session, rejects requests whose `Origin` header is not the dashboard origin, and returns only the token hash. Rate limit: 5 requests/min per user, enforced in Postgres (a `private.link_requests` log checked by a definer function), because in-memory limits do not work across serverless instances. The secret key (service role, SEC-07) exists only in server environment variables.
- **AUTH-09** The token is single-use and short-lived (expiry **300 s**, `otp_expiry`; single use and expiry confirmed by spike #10). It is never logged, persisted, or placed in a URL. It transits page JavaScript for a few seconds; the residual risk (an XSS on the dashboard origin could redeem it) is mitigated by the strict CSP with nonces (SEC-09) and no third-party scripts (SEC-15), and is the same class of risk as XSS reaching cookie-authenticated APIs.
- **AUTH-10** **The service worker is the single owner of the extension session.** Only the worker instantiates supabase-js (popup has none, EXT-UI-05a). Sessions persist through a custom storage adapter on `chrome.storage.local` (never `localStorage`). Auto-refresh timers are disabled (they die with the worker); before each API call the worker refreshes if the access token expires within 60 s, serialized by an in-memory lock so only one refresh runs (Chrome runs a single service worker per extension; a persisted lock could not be released by a killed worker). New tokens are written to storage before use. A worker killed after a rotation but before saving is recovered by Supabase's parent-token rule (reusing the parent returns the active token).
- **AUTH-11** If the session becomes invalid — refresh fails with an auth error, or an API call fails because the user no longer exists (auth error or foreign-key violation on ingest) — the extension clears the session, stops tracking (TRK-01), keeps unsynced intervals, and shows "Reconnect" in the popup. Pending intervals are uploaded after reconnecting **only if the same user reconnects**; if a different user connects, they are discarded after explicit confirmation (they belong to the previous account). The tracked-site list is dropped when the session is cleared and loaded again after reconnecting.
- **AUTH-11a** While not connected, if the last account left anything on this computer (pending or quarantined intervals, today's totals, tracked sites), the popup's Settings offers **Forget local data**, behind a confirmation that says unsynced time is lost. It deletes all of it, the device id and the sync status, after which any account can connect. It is refused while connected (Disconnect, AUTH-12, is the way then). A new device id and a cleared sync status also follow every change of data owner (#113).
- **AUTH-12** Disconnect is available in the popup and in dashboard Settings (sends `DISCONNECT`, same browser only). The extension first attempts a final sync; if intervals remain unsynced, the user confirms discarding them (popup) or disconnect is refused with a message (dashboard). Then it removes the local session (always, even offline), revokes it on the server best effort (bounded wait), and clears local tracking data, including the cached tracked-domain list.
- **AUTH-12a** Dashboard Settings offers **"Sign out of all devices"** (`signOut({ scope: 'global' })`), which revokes every session including extensions in other browsers — the remote revocation path.
- **AUTH-13** Deleting the account deletes the auth user server-side, revoking all refresh tokens. Already-issued access tokens remain valid until expiry (≤ 1 h, Supabase default) — accepted; writes fail anyway (no user row), triggering AUTH-11.

## 4. Fallback

Not needed: spike #10 confirmed the handoff. ADR-0003 option B (extension-side OAuth via `chrome.identity.launchWebAuthFlow`) remains documented in the ADR only.

## 5. Acceptance criteria

1. A new user can sign up with Google and with GitHub (verified manually against real providers in production setup; automated tests use a seeded local user).
2. After connecting, the extension and dashboard can each refresh independently for 24 h without logging the other out (manual soak check + unit test of storage adapter).
3. A `CONNECT` message from any other origin or extension is ignored (unit test of handler).
4. Replaying a used token hash fails.
5. Signing out of the dashboard does not disconnect the extension; disconnecting the extension does not sign out the dashboard.
