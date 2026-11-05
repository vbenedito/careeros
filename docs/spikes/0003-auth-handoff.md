# Spike 0003 — Dashboard → extension session handoff

Issue #10 · ADR-0003 · Date: 2026-11-05 · Result: **success — option C accepted, with the email provider disabled**

## Question

Can the dashboard server give the extension its **own** Supabase session through a single-use token (`auth.admin.generateLink` → `verifyOtp({ token_hash })`), while AUTH-01 holds: only Google/GitHub can create accounts?

## Method

`spikes/auth-handoff/spike.mjs` runs against a fresh local Supabase stack (CLI 3.0.0, GoTrue of the same stack used by Supabase Cloud) in CI, once per configuration:

| Scenario | Auth configuration |
|---|---|
| A | Supabase defaults (email provider on) |
| B | `[auth.email] enabled = false` |
| C | Email provider on + `before_user_created` hook allowing only `google`/`github` |

The test user is inserted like a GitHub OAuth user (provider `github`). The dashboard and the extension are two independent `supabase-js` 2.118.0 clients with separate storage. OTP expiry was set to 8 s to test expiry quickly. Admin calls used the new **secret key** (`sb_secret_…`).

Reproduce locally (Docker running): `npm i --no-save --prefix spikes/auth-handoff @supabase/supabase-js@2.118.0 && spikes/auth-handoff/run.sh B`

## Results (CI run 42036264019)

| Check | A | B | C |
|---|---|---|---|
| `generateLink(magiclink)` with the secret key | ok | ok | ok |
| The token hash yields a session (`type: "magiclink"`; `"email"` also works) | ok | ok | ok |
| `generateLink` sends **no e-mail** | ok | ok | ok |
| The extension session differs from the dashboard session (`session_id`) | ok | ok | ok |
| The same user | ok | ok | ok |
| **Single use**: replaying the hash fails | ok | ok | ok |
| **Expiry**: an unused hash fails after `otp_expiry` | ok | ok | ok |
| Both sessions refresh twice, independently, and stay valid | ok | ok | ok |
| Extension `signOut({scope:'local'})` keeps the dashboard session | ok | ok | ok |
| Dashboard `signOut({scope:'global'})` revokes the extension (AUTH-12a) | ok | ok | ok |
| Public `signUp` with email + password | **open** | blocked | blocked by hook |
| Public magic-link login for an existing user | rate-limited (inconclusive) | **blocked** ("Email logins are disabled") | rate-limited (inconclusive) |

The token hash is 56 characters long (fits `tokenHash: 16..512` in the shared schema). In scenario C the hook received `app_metadata.provider = "email"` for email sign-ups, so a hook would work, but it isn't needed.

## Decision

- **ADR-0003 option C is accepted.** The fallback B (extension-side OAuth) is not needed.
- **Configuration: email provider disabled** (`[auth.email] enabled = false`), `otp_expiry = 300` (AUTH-09). This closes email/password sign-up **and** email login while the admin handoff keeps working. Simpler than a hook, with nothing extra to maintain.
- The extension calls `verifyOtp({ token_hash, type: "magiclink" })`.

## Residual risks / follow-ups

- Real Google/GitHub OAuth can't run in CI; checked manually in production setup (#31) together with the same email-provider setting on Supabase Cloud.
- Supabase Cloud runs the same GoTrue, but its settings are configured in the dashboard, not `config.toml`: the production checklist (#31) must set "Email provider: disabled" and OTP expiry 300 s.
