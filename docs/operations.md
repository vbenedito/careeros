# Operations

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

One `study_sessions` row with its indexes is about 250 bytes. A heavy user (3 h of study a day, intervals of about 10 minutes) creates about 18 rows a day, about 6,600 rows a year: **≈ 1.6 MB per user per year**. With roughly 100 MB reserved for Postgres and Supabase internals, the free 500 MB holds about **250 user-years** of data. Tracked sites (≤ 12 per user) and auth rows are negligible.

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
- **Configuration:** in the GitHub **environment `production-backup`**, restricted to the `main` branch: secret `SUPABASE_DB_URL` (the **Session pooler** connection string ending in `?sslmode=require`; GitHub runners have no IPv6 for the direct connection) and variable `BACKUP_AGE_RECIPIENT` (the age public key). Without them the backup job **fails** (a skipped backup would be silent), and so does the [freshness check](#7-scheduled-checks-and-what-an-email-means). In the Backup workflow only the dump step receives the URL (#112). The [migration workflow](#6-database-migrations) uses the same environment and values (#147).
- **Setup checklist (one time, before merging a change to this workflow):**
  1. Settings → Environments → **New environment** `production-backup`; **Deployment branches and tags → Selected branches → `main`**.
  2. Add the secret `SUPABASE_DB_URL` and the variable `BACKUP_AGE_RECIPIENT` **to the environment**.
  3. **Delete the repository-level copies** (Settings → Secrets and variables → Actions → Repository): while one exists, a workflow edited on another branch could read it. The branch rule is the real protection; the workflow's `if: main` is only a second layer, because a branch can edit the workflow.
  4. Keep `main` protected (pull requests only), since whoever can push to `main` can change the workflow.
  5. Settings → Code security → **Private vulnerability reporting: on** (used by `SECURITY.md`).
- **Tested:** every CI run performs the full round trip against the local stack (seed → dump → encrypt → decrypt → fresh database from the migrations → restore → identical rows): [`scripts/ops/backup-restore-test.sh`](../scripts/ops/backup-restore-test.sh).

### Restore procedure

1. Download the artifact `careeros-YYYY-MM-DD-run….sql.gz.age` from the Backup workflow run (Actions → Backup → the run → Artifacts) and unzip the download.
2. Prepare an empty database with the current schema:
   - **New Supabase project:** create it, put its Session pooler string in the `SUPABASE_DB_URL` secret of the `production-backup` environment (step 4, §6 below), then Actions → **Database migrations (production)** → Run workflow, mode **apply** ([§6](#6-database-migrations)). The pre-migration backup of the empty project is harmless. Without Actions, use the laptop fallback in §6.
   - **Local check first (recommended):** `pnpm db:start`, then `pnpm exec supabase db reset`.
3. Restore (one transaction: all or nothing). The connection string holds the database password, so type it at a hidden prompt instead of putting it in a command line or the shell history:

   ```bash
   read -rs -p "Connection string: " PGURL && export PGURL && echo
   age --decrypt --identity ~/careeros-backup.key careeros-YYYY-MM-DD-run….sql.gz.age \
     | gunzip | scripts/ops/db-restore.sh
   unset PGURL
   ```

   Locally the connection string is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; for a cloud project use its Session pooler string.
4. **New project only**, redo the parts of the production setup that depend on the project (the § numbers below are sections of the private production setup guide, not of this document):
   - §2 auth settings (OTP expiry, email provider disabled, Site URL, redirect URL, providers);
   - §3 OAuth apps: change the callback URL of the Google and GitHub apps to the new `https://<new-ref>.supabase.co/auth/v1/callback`;
   - §4 Vercel environment (Supabase URL and both keys), then redeploy;
   - §5 a new extension release with the new URL and publishable key;
   - §6 the `SUPABASE_DB_URL` secret **in the `production-backup` environment** (never at repository level), if not already done in step 2.

   Restored accounts keep their ids, so each user finds their data after signing in again and reconnecting the extension (sessions are not in the backup).

## 5. Routine checks

| When | What |
|---|---|
| Automatic | The scheduled checks of [§7](#7-scheduled-checks-and-what-an-email-means) (daily smoke, daily health, weekly backup, backup freshness). A failed run emails whoever last changed the workflow's schedule. |
| Monthly | **Actions:** Backup, Production health and Production smoke are still enabled (GitHub disables schedules after 60 days without repository activity; re-enable them there; the freshness check emails you if Backup stops) and their last runs are green. |
| Monthly | Supabase usage (database size, egress) and Vercel usage pages: far below the limits above. |
| After a dependency or Supabase upgrade | CI green, including the backup round trip. |
| After merging a migration | **Actions → Database migrations (production):** the run is green and its summary's migration history shows every migration on both sides ([release](process/release.md#database-migrations)). |

## 6. Database migrations

Production migrations are applied by [`.github/workflows/migrate.yml`](../.github/workflows/migrate.yml) (#147), so they do not depend on anyone's laptop:

- **Automatic:** every push to `main` that changes `supabase/migrations/**` backs up the database (same encrypted dump as §4, artifact `careeros-YYYY-MM-DD-run<id>-pre-migration.sql.gz.age`, 90 days), then runs `supabase db push --dry-run`, `supabase db push` and `supabase migration list`, with the results in the run's summary.
- **On demand:** Actions → Database migrations (production) → Run workflow on `main`. Mode **dry-run** (default) only shows what would be applied; **apply** does the full run.
- **Tooling:** only the Supabase CLI (`supabase/setup-cli`, pinned by commit SHA, same version as `package.json`) plus `age` and the dump image of §4; the job does not run `pnpm install`, so no dependency install script runs where the database URL is available. When upgrading the `supabase` devDependency, update `version:` in the workflow too (the run fails on a mismatch).
- **Configuration:** the `production-backup` environment of §4 (`SUPABASE_DB_URL`, `BACKUP_AGE_RECIPIENT`); no other secrets. A missing value fails the run instead of skipping it, and `apply` refuses to run without the backup recipient. One run at a time (`concurrency: migrate-production`), never cancelled half-way.
- **If a run fails:** read the summary and the step log. A failed backup stops the run before anything is applied. A failed `db push` stops at the failing migration: Postgres rolls back that migration's transaction, earlier ones in the same run stay applied; the migration history section shows which. Fix forward with a new migration (the [release process](process/release.md#database-migrations)); restore the pre-migration backup (§4) only for data loss.

**Emergency fallback (Actions unavailable):** from a laptop with the repository at the merged `main` commit. First take a backup if at all possible (Backup workflow, or `scripts/ops/backup-encrypted.sh` with `PGURL` typed at a hidden prompt as in §4 and `AGE_RECIPIENT` set to the public key), then:

```bash
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase db push --remote --dry-run   # review
pnpm exec supabase db push --remote
pnpm exec supabase migration list --remote
```

Supabase CLI 3 targets the local stack unless `--remote` is given. Afterwards, run the workflow in **dry-run** mode once it is available again: it should report nothing to apply.

## 7. Scheduled checks and what an email means

There is no error-tracking vendor and no client telemetry (ENV-11): the alert is **GitHub's email for a failed workflow run**, sent to whoever last changed the workflow's schedule. All checks are read-only. If you stop receiving them, check **Settings → Notifications → Actions** and that the workflows are enabled.

| Workflow (when) | What it checks | Needs |
|---|---|---|
| [Production smoke](../.github/workflows/smoke.yml) (after each successful Production deployment, daily 09:43 UTC, on demand) ENV-12 | The live site and the hosted Supabase project: landing canonical equals the site, "Add to Chrome" links to the store listing, CSP header present, `/robots.txt`, `/sitemap.xml`, `/privacy`, signed-out `/dashboard` redirects to sign-in, Supabase CORS preflight and `Date` exposed to the store extension's origin | Repository **variables** (no secrets): `SMOKE_SITE_URL`, `SMOKE_STORE_URL`, `SMOKE_SUPABASE_URL`, `SMOKE_SUPABASE_PUBLISHABLE_KEY` |
| [Production health](../.github/workflows/health.yml), job *Sync activity* (daily 07:27 UTC, on demand) ENV-13 | Counts of uploaded sessions and active users in a READ ONLY database transaction. Fails when **no session was uploaded in 24 h although someone uploaded in the 7 days before**, or uploads fall **below 25% of the prior daily average** (only once that average is 20 a day or more). Both only with enough prior activity: **at least 3 distinct uploading users on at least 3 different days** in the 7 days before, so a quiet small user base does not email every day (the summary says when the alert was off) | The `production-backup` environment (same `SUPABASE_DB_URL` as the backup) |
| Production health, job *Backup freshness* (same run) ENV-14 | The newest scheduled backup artifact is **under 8 days old** (catches a failing Backup; it cannot catch GitHub disabling schedules, see below) | Nothing |
| [Backup](../.github/workflows/backup.yml) (Mondays 06:17 UTC) | Fails when its configuration is missing, instead of skipping | §4 |
| [Database migrations](../.github/workflows/migrate.yml) (merge to `main` touching migrations) | After the push, a read-only check that every public table has row level security and the `private` schema is closed; in apply mode, that production has all the repository's migrations | §6 |

**Scheduled workflows can be disabled silently.** GitHub disables scheduled workflows in a public repository after 60 days without repository activity, and then no email is sent. The freshness check is itself scheduled, so it stops too. Do the **monthly manual check** of §5: Actions → Backup, Production health and Production smoke are enabled and have a recent run (re-enable and *Run workflow* if not). Merging anything counts as activity.

**Repository variables to create once** (Settings → Secrets and variables → Actions → Variables; none is secret): `SMOKE_SITE_URL` (the production origin, e.g. `https://careeros-taupe.vercel.app`), `SMOKE_STORE_URL` (`https://chromewebstore.google.com/detail/<slug>/<extension ID>`), `SMOKE_SUPABASE_URL` (the project URL) and `SMOKE_SUPABASE_PUBLISHABLE_KEY` (the `sb_publishable_…` key). Until they exist the smoke workflow fails on purpose, naming the missing one.

### First steps for each email

Open the run (the link in the email) and read the red step and the job summary. The summary of the health check holds counts only.

| Email from | Likely causes | First steps |
|---|---|---|
| Smoke: canonical or "Add to Chrome" | A build-time value is wrong or was changed without redeploying (`SITE_URL`, `EXTENSION_INSTALL_URL`) | Fix it in Vercel (Production scope), **redeploy**, run the workflow again ([release](process/release.md#dashboard)) |
| Smoke: CSP, robots, sitemap, privacy, dashboard redirect | A bad deployment, or the proxy/route changed | Open the page; promote the previous Production deployment in Vercel if it is broken |
| Smoke: CORS preflight or `Date` | The Supabase project, its API gateway or CORS settings changed, or the project moved. The extension cannot read the server clock, so devices with a fast clock quarantine intervals (SYNC-05a) | Check the project is not paused (§1) and the URL variable is right; look at Supabase status; consider a hotfix of SYNC-05a's fallback |
| Health: no sessions in 24 h / sharp drop | Uploads are failing: paused or unreachable project, a migration or release broke the ingest function, an extension release is rejecting data, or (with very few users) nobody studied that day | Check §1 (paused project), the latest **Database migrations** and Vercel deployments, and `ingest_study_sessions` in the Supabase dashboard (logs, API errors). With only a handful of users a quiet day is possible: re-run the next day before digging |
| Health: cannot run | `SUPABASE_DB_URL` missing or rotated, project paused, or the pooler string is wrong | Fix the environment secret (§4 setup checklist) and run the workflow again |
| Backup freshness | Backup is disabled (60 days of inactivity), failing, or never configured | Actions → Backup: enable it and **Run workflow**; read the failing step (§4) |
| Backup: configuration missing | `SUPABASE_DB_URL` or `BACKUP_AGE_RECIPIENT` is not in the environment | §4 setup checklist |
| Migrations: post-migration check | A public table without row level security, or `private` exposed: a security regression | Treat as an incident: review the last migration, fix forward with a new migration at once ([release](process/release.md#database-migrations)) |

## Chrome Web Store

The extension is published from `pnpm --filter @careeros/extension release:store` ([listing](chrome-web-store/listing.md), STORE-01..07). A new dashboard domain means a new store version (its `externally_connectable` origin changes) and a store review before switching the domain.
