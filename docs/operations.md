# Operations (v0)

How CareerOS runs in production, what it costs, and how to recover it. The one-time production setup (accounts, auth settings, OAuth apps, environment) is kept privately by the product owner.

## 1. Free tier and its behavior

| Service | Plan | What matters for CareerOS |
|---|---|---|
| Supabase | Free | 500 MB database per project, 5 GB egress/month, 50,000 monthly active users, 2 free projects. **The project pauses after one week without activity**, and no automatic backups are included (daily backups start on Pro). |
| Vercel | Hobby | 1,000,000 function invocations, 4 active CPU-hours and 100 GB fast data transfer per month. **Personal, non-commercial use only.** |
| GitHub | Public repository | Actions minutes are free for public repositories; workflow artifacts are kept up to 90 days. |

Figures were checked on 2026-11-08 ([Supabase limits summary](https://automationatlas.io/answers/supabase-free-tier-limits-2026/), [Vercel Hobby docs](https://examples.vercel.com/docs/plans/hobby)). Providers change them: check the official pricing pages before relying on a number.

### When the Supabase project pauses

Any sign-in, dashboard visit or extension sync counts as activity, so a project in daily use does not pause. If it does pause (for example after a vacation):

- **The dashboard** fails to load data ("Couldn't load your study time").
- **The extension** keeps tracking. Uploads fail and retry with backoff (SYNC-03). Intervals wait in the outbox for up to **30 days** (`LOCAL_QUEUE_MAX_AGE_D`, SYNC §2); older ones are dropped and counted in the popup.
- **To restore:** open the project in the Supabase dashboard and choose **Restore project** (it takes a few minutes). Nothing else is needed: the extension's next sync cycle (within 5 minutes) uploads the waiting intervals.

## 2. Capacity estimate

One `study_sessions` row with its indexes is about 250 bytes. A heavy user (3 h of study a day, intervals of about 10 minutes) creates about 18 rows a day, about 6,600 rows a year: **≈ 1.6 MB per user per year**. With roughly 100 MB reserved for Postgres and Supabase internals, the free 500 MB holds about **250 user-years** of data. Tracked sites (≤ 50 per user) and auth rows are negligible.

Traffic is small: each extension syncs at most every 5 minutes while the browser is open, and the dashboard renders on demand. Monthly active users are bounded by the 50,000 auth limit long before Vercel's invocation limit matters.

## 3. When a paid plan becomes necessary

- **Any commercial use** (charging users, ads, a company using it): Vercel Pro, because Hobby is non-commercial only.
- **More than about 200 active users**, or a database above ~400 MB: Supabase Pro (8 GB database, daily backups, no pausing).
- **Users who cannot tolerate a paused project:** Supabase Pro.

Until then the cost of v0 is zero.

## 4. Backups

Supabase Free has no automatic backups, so the repository makes its own:

- **What:** a data-only dump of `auth.users`, `auth.identities`, `public.tracked_domains` and `public.study_sessions` ([`scripts/ops/db-dump.sh`](../scripts/ops/db-dump.sh)). The schema is not in the dump: it is the migrations in this repository. Restore = migrations + dump. Left out on purpose: sign-in sessions (everyone signs in and reconnects the extension after a restore to a new project) and `private.link_requests` (rate-limit counters).
- **When:** every Monday at 06:17 UTC, or on demand (Actions → Backup → Run workflow): [`.github/workflows/backup.yml`](../.github/workflows/backup.yml). **GitHub silently disables schedules in a public repository after 60 days without repository activity**: see the monthly check in §5.
- **Protection:** the repository is public, so the dump is **encrypted with [age](https://age-encryption.org) inside the job, before it is stored**. The plaintext never reaches the disk or the artifact store. Only the private key can read it, and it never leaves the product owner's computer (keep a second copy in a password manager).
- **Where:** an artifact of the workflow run, kept for 90 days (about 13 weekly copies).
- **Configuration:** repository secret `SUPABASE_DB_URL` (the **Session pooler** connection string; GitHub runners have no IPv6 for the direct connection) and repository variable `BACKUP_AGE_RECIPIENT` (the age public key). Without them the job is skipped.
- **Tested:** every CI run performs the full round trip against the local stack (seed → dump → encrypt → decrypt → fresh database from the migrations → restore → identical rows): [`scripts/ops/backup-restore-test.sh`](../scripts/ops/backup-restore-test.sh).

### Restore procedure

1. Download the artifact `careeros-YYYY-MM-DD-run….sql.gz.age` from the Backup workflow run (Actions → Backup → the run → Artifacts) and unzip the download.
2. Prepare an empty database with the current schema:
   - **New Supabase project:** create it, then `pnpm exec supabase link --project-ref <ref>` and `pnpm exec supabase db push`.
   - **Local check first (recommended):** `pnpm db:start`, then `pnpm exec supabase db reset`.
3. Restore (one transaction: all or nothing). The connection string holds the database password, so type it at a hidden prompt instead of putting it in a command line or the shell history:

   ```bash
   read -rs -p "Connection string: " PGURL && export PGURL && echo
   age --decrypt --identity ~/careeros-backup.key careeros-YYYY-MM-DD-run….sql.gz.age \
     | gunzip | scripts/ops/db-restore.sh
   unset PGURL
   ```

   Locally the connection string is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; for a cloud project use its Session pooler string.
4. **New project only**, redo the parts of the production setup that depend on the project:
   - §2 auth settings (OTP expiry, email provider disabled, Site URL, redirect URL, providers);
   - §3 OAuth apps: change the callback URL of the Google and GitHub apps to the new `https://<new-ref>.supabase.co/auth/v1/callback`;
   - §4 Vercel environment (Supabase URL and both keys), then redeploy;
   - §5 a new extension release with the new URL and publishable key;
   - §6 the `SUPABASE_DB_URL` secret.

   Restored accounts keep their ids, so each user finds their data after signing in again and reconnecting the extension (sessions are not in the backup).

## 5. Routine checks

| When | What |
|---|---|
| Weekly (automatic) | Backup workflow runs. A failed scheduled run emails whoever last changed the workflow's schedule. |
| Monthly | **Actions → Backup:** the workflow is still enabled (GitHub disables schedules after 60 days without repository activity; re-enable it there) and the last run is green. |
| Monthly | Supabase usage (database size, egress) and Vercel usage pages: far below the limits above. |
| After a dependency or Supabase upgrade | CI green, including the backup round trip. |
