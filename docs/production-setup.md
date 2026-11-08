# Production setup (v0)

One-time setup of the production environment (#31). The product owner creates the accounts and enters every secret directly in the provider's settings: **secrets never go into the repository, a chat or an issue.** Operations after launch: [`operations.md`](operations.md).

Order matters: Supabase → OAuth apps → Vercel → extension → checks.

Placeholders: `<ref>` is the Supabase project reference, `<dashboard>` the production dashboard origin (e.g. `https://careeros.vercel.app`).

## 1. Supabase project

1. In [supabase.com](https://supabase.com), create a project on the **Free** plan in the **South America (São Paulo)** region (`sa-east-1`): lower latency for Brazilian users and data stored in Brazil. If it is not offered, choose the closest region and record it in step 3.4.
2. Store the database password in a password manager.
3. Apply the schema from this repository (from the repository root, on your computer):

   ```bash
   pnpm exec supabase login                       # opens the browser; no token in the terminal history
   pnpm exec supabase link --project-ref <ref>
   pnpm exec supabase db push                      # applies supabase/migrations
   ```

   Do **not** run `supabase config push`: `supabase/config.toml` holds the *local* settings (localhost URLs).

## 2. Auth settings (Supabase dashboard → Authentication)

These must match spike 0003 and the local `supabase/config.toml`:

| Setting | Value |
|---|---|
| Sign In / Providers → **Email** | **Disabled** (no password or email sign-up; magic links are only minted by the dashboard server for the extension handoff) |
| Email OTP / magic link expiry | **300** seconds |
| URL Configuration → Site URL | `<dashboard>` |
| URL Configuration → Redirect URLs | `<dashboard>/auth/callback` (only this one) |
| Providers → Google, GitHub | Enabled with the client id and secret from step 3 |

## 3. OAuth apps

Both providers send users back to **Supabase**, not to the dashboard: the callback URL is `https://<ref>.supabase.co/auth/v1/callback`.

- **GitHub** (Settings → Developer settings → OAuth Apps → New): homepage `<dashboard>`, callback `https://<ref>.supabase.co/auth/v1/callback`. Generate a client secret and paste id and secret into Supabase → Providers → GitHub. The dashboard asks for the `user:email` scope itself (AUTH-05).
- **Google** (Google Cloud Console → APIs & Services): configure the OAuth consent screen (external, app name CareerOS, scopes `email`, `profile`, `openid`, privacy policy link `<dashboard>/privacy`), then create an OAuth client of type *Web application* with the authorized redirect URI `https://<ref>.supabase.co/auth/v1/callback`. Paste id and secret into Supabase → Providers → Google.

## 4. Vercel (dashboard)

1. Import the GitHub repository in Vercel. **Root directory:** `apps/web` (Vercel detects Next.js and pnpm).
2. Environment variables (Production):

   | Variable | Value | Secret? |
   |---|---|---|
   | `SITE_URL` | `<dashboard>` | no |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | no |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project settings → API keys → publishable key | no (public by design) |
   | `SUPABASE_SECRET_KEY` | Supabase → API keys → **secret** key | **yes**: mark it *Sensitive*; never `NEXT_PUBLIC_` (SEC-07) |
   | `NEXT_PUBLIC_EXTENSION_ID` | `negamegjachlkaemamlfhaecippkncbl` (production build, fixed by its manifest key) | no |
   | `PRIVACY_CONTROLLER` | Name of the person responsible for the data (SEC-13) | no |
   | `PRIVACY_CONTACT_EMAIL` | Contact address for privacy requests | no |
   | `DATA_REGION` | e.g. `São Paulo, Brazil (sa-east-1)` | no |

   A production build **fails** if a privacy variable is missing, so `/privacy` never goes live with placeholders.
3. Deploy. Check that `<dashboard>/privacy` shows your details and that `<dashboard>/` redirects to sign-in.

## 5. Extension release

1. Create `apps/extension/.env.production` (git-ignored):

   ```bash
   VITE_DASHBOARD_ORIGIN=<dashboard>
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
   ```

   The build refuses secret keys and non-https URLs.
2. Build and package: `pnpm --filter @careeros/extension release` → `apps/extension/careeros-extension-<version>.zip`.
3. Publish it as a GitHub Release (ENV-05a), e.g. `gh release create v0.1.0 apps/extension/careeros-extension-0.1.0.zip --title "CareerOS v0.1.0"`. In the notes, add the install steps: unzip → `chrome://extensions` → Developer mode → **Load unpacked** → choose the folder. Updates: replace the folder's contents and click reload.

## 6. Backups

1. Create an age key pair on your computer (`brew install age`, then `age-keygen -o ~/careeros-backup.key`). Keep the key file offline plus a copy in a password manager; **losing it makes every backup unreadable.**
2. GitHub → repository → Settings → Secrets and variables → Actions:
   - **Secret** `SUPABASE_DB_URL`: Supabase → Connect → **Session pooler** connection string, with the database password.
   - **Variable** `BACKUP_AGE_RECIPIENT`: the public key printed by `age-keygen` (`age1…`).
3. Actions → Backup → **Run workflow** once; it must be green and produce a `careeros-YYYY-MM-DD.sql.gz.age` artifact. Optionally restore it locally ([`operations.md`](operations.md) §4).

## 7. Launch checks (manual, recorded in the delivery report)

- [ ] **Sign up with Google** and **with GitHub** on `<dashboard>` (new accounts). The browser console shows no Content Security Policy errors during the redirects (TEST §4.3, #29).
- [ ] Install the released extension and **connect it** from `<dashboard>/connect` (handoff against production, spike 0003).
- [ ] Study for a few minutes on a tracked site, wait for a sync (≤ 5 min), and see the time on the dashboard.
- [ ] `<dashboard>/privacy` shows the controller, the contact and the region.
- [ ] The Backup workflow ran green once.
