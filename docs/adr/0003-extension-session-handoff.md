# ADR-0003 — Dashboard-initiated extension session via single-use token

Status: **Accepted** (spike #10, 2026-11-05) · Date: 2026-11-04

## Context
Product decision: users log in on the dashboard and the session is "handed" to the extension. Supabase rotates refresh tokens; reusing one outside a short reuse window (10 s default) marks the whole session as compromised and revokes it. Therefore the extension must not share the dashboard's session — it needs its own, created from the dashboard's authenticated context.

## Options
A. **Copy dashboard tokens to the extension** — simplest; breaks on first refresh race; rejected.
B. **Extension runs its own OAuth** with `chrome.identity.launchWebAuthFlow` (PKCE, redirect `https://<id>.chromiumapp.org/`) — independent and standard; second login prompt for the user; needs extension redirect URL in Supabase.
C. **Single-use token minted by the dashboard server** — server (service role) calls `auth.admin.generateLink({ type: 'magiclink', email })` for the signed-in user, sends only the hashed token to the extension through `externally_connectable` messaging, and the extension exchanges it with `verifyOtp({ token_hash })` for its own session. No e-mail is sent.

## Decision
**C**, matching the product decision (one login, on the dashboard), with **B as fallback** if the spike fails.

Spike exit criteria: token hash from `generateLink` yields a session through `verifyOtp` in supabase-js from an extension context; token is single-use; expiry configurable to 300 s; dashboard and extension refresh independently.

## Consequences
+ One login; independent sessions; disconnecting one does not affect the other.
+ The token is single-use, short-lived, never e-mailed or put in a URL, and only deliverable to our extension ID from our origin.
− The token transits dashboard page JavaScript for seconds; an XSS on the dashboard could redeem it. Mitigated by nonce-based CSP and no third-party scripts; same risk class as XSS against cookie-authenticated APIs.
− Remote revocation of an extension in another browser is only possible via "Sign out of all devices" (no per-device session registry in v0).
− Requires service-role usage in a dashboard route (server-only secret, narrowly scoped route).
− Relies on admin link generation behaving as documented; covered by the spike and an integration test.

## Spike result (2026-11-05)

Validated in [spike 0003](../spikes/0003-auth-handoff.md) on the real Supabase Auth server: the token yields an independent session, is single-use, expires per `otp_expiry`, sends no e-mail, and both sessions refresh and sign out independently. Running it with the **email provider disabled** keeps the handoff working and closes email sign-up and email login, so AUTH-01 holds without an auth hook. Option B is not needed.
