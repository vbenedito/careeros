# OAuth setup: Google and GitHub

CareerOS accounts come only from Google and GitHub (AUTH-01). Each provider needs an **OAuth app**, and Supabase needs its client ID and secret.

- **Local:** optional. Automated tests don't need it; they use seeded users. Use it to try real sign-in on your machine.
- **Production:** required. Done during production setup (#31) with the production URLs below.

> Never commit a client secret. Locally it goes in `supabase/.env` (git-ignored); in production it is entered in the Supabase dashboard.

## URLs you will need

| | Local | Production |
|---|---|---|
| Supabase auth callback (paste into Google/GitHub) | `http://127.0.0.1:54321/auth/v1/callback` | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Dashboard | `http://localhost:3000` | `https://<your-dashboard-domain>` |

## 1. GitHub

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Fill in:
   - **Application name:** `CareerOS (local)` (create a separate `CareerOS` app for production)
   - **Homepage URL:** the dashboard URL from the table
   - **Authorization callback URL:** the Supabase auth callback from the table
3. **Register application**, then **Generate a new client secret**. Copy the client ID and the secret; the secret is shown only once.

The dashboard requests the `user:email` scope, so GitHub shares a verified email (AUTH-05).

## 2. Google

1. [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.
2. **APIs & Services → OAuth consent screen**:
   - user type **External**
   - app name `CareerOS`, your support email
   - scopes: `openid`, `email`, `profile` only
   - while in testing mode, add yourself (and any testers) as **test users**
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - **Application type:** Web application
   - **Authorized JavaScript origins:** the dashboard URL
   - **Authorized redirect URIs:** the Supabase auth callback from the table
4. Copy the client ID and the client secret.

## 3a. Enable locally

1. Create `supabase/.env` (git-ignored):
   ```bash
   SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID=...
   SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET=...
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
   ```
2. In `supabase/config.toml`, set `enabled = true` under `[auth.external.github]` and/or `[auth.external.google]`. **Don't commit this change.**
3. Restart: `pnpm db:stop && pnpm db:start`.
4. Start the dashboard (`pnpm --filter @careeros/web dev`), open `http://localhost:3000`, and click **Continue with GitHub/Google**.

## 3b. Enable in production (#31)

Supabase dashboard → your project:
- **Authentication → Sign In / Providers:** enable **GitHub** and **Google** and paste the IDs and secrets. Keep **Email disabled** (AUTH-05a, spike 0003).
- **Authentication → URL Configuration:**
  - **Site URL** = the dashboard URL
  - **Redirect URLs** = `https://<your-dashboard-domain>/auth/callback` only (SEC-11)

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "redirect_uri_mismatch" (Google) or "The redirect_uri is not associated" (GitHub) | The callback URL in the provider app is not exactly the Supabase auth callback |
| Back on `/sign-in?error=oauth` | Consent was cancelled, or the provider shared no verified email |
| Back on `/sign-in?error=callback` | The redirect URL is not in Supabase's allowed list, or the code expired; try again |
