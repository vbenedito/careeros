# 09 — Environments, Tooling & CI

Status: **Approved (2026-11-04)** · Related ADRs: 0001 (monorepo), 0008 (Docker-based local backend)

Amended 2026-11-11 (#131): repository layout, Node version, environment variables (ENV-05b), CI jobs (ENV-08) and the backup workflow, to match the repository.

Amended 2026-11-12 (#142): ENV-08 runs the responsive layout checks (TEST-01) and uploads their screenshots.

Amended 2026-11-12 (#157): ENV-08 `checks` runs `pnpm check:spec-trace` (TEST-02).

Amended 2026-11-12 (#147): ENV-08 applies production migrations with the workflow `migrate.yml` instead of from a laptop.

Amended 2026-11-12 (#155, #156): ENV-08 `checks` runs the Markdown link check and the store package check.

Amended 2026-11-12 (grill H3, H1): ENV-05b production build validation; ENV-11 server-log error reports (still no third-party error tracking).

Amended 2026-11-12 (#82): ENV-08 `backend` moves the runner's ephemeral ports above the stack's fixed ports before `supabase start` and retries the start once.

## 1. Repository layout

```
careeros/
├─ apps/
│  ├─ extension/          Chrome MV3 extension (Vite + React + Tailwind)
│  │  ├─ src/engine/      pure tracking engine (TRK-16)
│  │  ├─ src/background/  service worker: Chrome adapters, sync, auth
│  │  └─ src/popup/       popup UI
│  └─ web/                Next.js dashboard (App Router, shadcn/ui, Tailwind)
├─ packages/
│  └─ shared/             domain rules, Zod schemas, constants, formatting
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  ├─ seed.sql            local/E2E data only
│  └─ tests/              pgTAP
├─ scripts/
│  ├─ setup-env.ts        writes local env files from `supabase status` (`pnpm setup:env`)
│  ├─ ci/integration.sh   builds and runs the integration and E2E suites (CI backend job)
│  └─ ops/                database dump, restore and backup → restore test
├─ specs/                 SDD specifications
├─ docs/                  index, architecture, ADRs, process, operations, history
├─ spikes/                time-boxed experiments (not part of the product or CI)
├─ .github/workflows/     CI
├─ AGENTS.md
└─ README.md
```

- **ENV-01** Package manager **pnpm** workspaces; no build orchestrator (Turborepo/Nx) in v0 — `pnpm -r` is enough at this size.
- **ENV-02** TypeScript `strict` everywhere, shared base `tsconfig`. Lint/format with **Biome** only (one fast tool instead of ESLint + Prettier), using its `react`, `next` and `test` rule domains; **no ESLint** (decided in #1: Biome 2.6 covers the Next.js rules we need). Markdown is not formatted by Biome.
- **ENV-03** Versions: Node 26 (pinned in `.nvmrc` as `26` and `engines` as `26.x`), pnpm from `packageManager`, latest stable Next.js, React, supabase-js at Gate 3 start, recorded in the README.

## 2. Environments

| Env | Backend | Dashboard | Extension build |
|---|---|---|---|
| **Local** | Supabase CLI stack in **Docker Desktop** (`supabase start`: Postgres, Auth, Studio, Inbucket) | `next dev` on `http://localhost:3000` | dev build, `externally_connectable` → localhost:3000, Supabase → local |
| **Production** | Supabase Cloud project (free tier) | Vercel (free tier) | prod build, published on the Chrome Web Store (STORE, since 2026-11-12); unpacked zips from GitHub Releases for older installs |

- **ENV-04** No staging in v0.
- **ENV-05** Configuration via env files (`.env.local`, never committed; `.env.example` committed). The extension's build-time config (dashboard origin, Supabase URL + publishable key, extension `key`) is injected by Vite per mode. Dev and prod builds use **different** manifest keys (different IDs, installable side by side; each dashboard env knows its own ID). The manifest `key` is a **public** key; the private keys were intentionally not kept, since unpacked builds don't need them (a Chrome Web Store iteration would use the store's signing).
- **ENV-05b** Environment variables (templates: `apps/web/.env.example`, `apps/extension/.env.example`):

| Variable | Where | Rules |
|---|---|---|
| `SITE_URL` | web | The dashboard origin; required at runtime for redirects and Origin checks (SEC-08). Pages built at build time (landing, robots, sitemap) fall back to `https://$VERCEL_PROJECT_PRODUCTION_URL`, then `http://localhost:3000` (`buildSiteUrl`, never used for security). HSTS is sent only when it is https |
| `VERCEL_PROJECT_PRODUCTION_URL` | web (set by Vercel) | Fallback for build-time pages only, see `SITE_URL` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | web | Required; public |
| `SUPABASE_SECRET_KEY` | web (server only) | Required for the link route and account deletion; never `NEXT_PUBLIC_` (SEC-07) |
| `NEXT_PUBLIC_EXTENSION_ID` | web | Required; ID of the extension build this dashboard talks to (AUTH-06) |
| `GOOGLE_SITE_VERIFICATION` | web | Optional. Google Search Console meta-tag token on the landing page (LAND-09); read at build time |
| `EXTENSION_INSTALL_URL` | web | Optional; must be https. The landing page's install link; without it, the Chrome Web Store search for CareerOS |
| `PRIVACY_CONTROLLER`, `PRIVACY_CONTACT_EMAIL`, `DATA_REGION` | web | Shown on `/privacy` (SEC-13). Optional locally (a "not configured" marker is shown); `next.config.ts` fails the build when any is missing and `VERCEL_ENV=production` |
| Production build check | web | Amended 2026-11-12 (grill H3). When `VERCEL_ENV=production`, `next.config.ts` (`lib/env-check.ts`) fails the build unless: `SITE_URL` is https; `NEXT_PUBLIC_EXTENSION_ID` matches `^[a-p]{32}$`; `NEXT_PUBLIC_SUPABASE_URL` is https; `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is set; `EXTENSION_INSTALL_URL` is an https `chromewebstore.google.com/detail/…` URL (so the store search fallback is for non-production builds only); and the `PRIVACY_*`/`DATA_REGION` values above exist. Each message names the variable and says to set it in the Vercel project that builds production, Production scope. Preview, CI and local builds are not checked |
| `VITE_DASHBOARD_ORIGIN` | extension | Required; an origin without path, https in production builds |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | extension | Required (https URL, `sb_publishable_…` key) in production builds; development builds may omit them and report "not configured". Values that look like secrets fail the build |

- **ENV-05a** Releases: semantic version in `manifest.json`; each release is a GitHub Release with the prod zip and install/update instructions (load unpacked → replace folder → reload). Updates are manual for unpacked builds; store installs update automatically (STORE). AUTH-07a surfaces outdated builds. Amended 2026-11-12 (#133).
- **ENV-06** Local OAuth: the local stack is used with seeded users (admin API) for development and tests; optionally a GitHub OAuth app for `localhost` can be configured, documented but not required.
- **ENV-07** The dashboard is **not** containerized in v0 (Vercel builds it natively); Docker is used for the backend stack, database tests and CI parity (ADR-0008).

## 3. CI (GitHub Actions)

- **ENV-08** Workflow `.github/workflows/ci.yml` on pull requests and pushes to `main` (Node from `.nvmrc`, pnpm from `packageManager`):
  1. `checks` ("Lint, typecheck, test, build"): install (`--frozen-lockfile`, cached pnpm store) → `pnpm lint` (Biome) → `pnpm typecheck` → `pnpm check:spec-trace` (spec-ID traceability, TEST-02; counts in the job summary) → `pnpm check:links` (relative links and anchors in the Markdown docs, no network) → `pnpm test:coverage` (Vitest with the TEST §3 thresholds) → install Playwright's Chromium (cached, same key as `backend`) → landing responsive layout (`pnpm --filter @careeros/extension test:responsive`, TEST-01) → upload `responsive-screenshots/` as the artifact `responsive-screenshots-landing` (14 days, also when the check fails) → `pnpm build` (extension development build and dashboard) → `pnpm check:store-package` (builds the production store zip with placeholder public values, no secrets, and asserts on its `manifest.json` and file list: STORE).
  2. `backend` ("Database (Supabase in Docker)"): install → `supabase start -x studio,postgres-meta` (after moving the runner's ephemeral port range to 61000–65535, above the stack's fixed ports 54320–54329; one retry after `supabase stop`) → `pnpm db:reset` → `pnpm db:test` (pgTAP) → install Playwright's Chromium (cached) → `scripts/ci/integration.sh` (builds the dashboard and the extension, starts one dashboard server, runs the web integration, extension integration and E2E suites; E2E includes the app pages' responsive layout, TEST-01) → upload `responsive-screenshots/` as the artifact `responsive-screenshots-app` (14 days, also when a test fails) → backup → restore round trip (`scripts/ops/backup-restore-test.sh`, `age` pinned by checksum) → on failure, print the dashboard server log → `supabase stop`.

  Workflow `.github/workflows/backup.yml` runs weekly (Mondays 06:17 UTC) and on demand, only on `main`, in the GitHub environment `production-backup`: it dumps the production database (`scripts/ops/db-dump.sh`), encrypts it with `age` and stores it as an artifact for 90 days. Without `SUPABASE_DB_URL` and `BACKUP_AGE_RECIPIENT` it skips.

  Workflow `.github/workflows/migrate.yml` ("Database migrations (production)") runs on pushes to `main` that change `supabase/migrations/**` and on demand (`mode`: `dry-run`, the default, or `apply`), only on `main`, in the same environment `production-backup`, one run at a time and never cancelled (`concurrency: migrate-production`): Supabase CLI only (`supabase/setup-cli` pinned by SHA, same version as `package.json`; no `pnpm install` in a job that holds the database URL) → (apply) encrypted backup with the same script as `backup.yml` (`scripts/ops/backup-encrypted.sh`, artifact for 90 days) → `supabase db push --dry-run` → (apply) `supabase db push --yes` → `supabase migration list`, with the dry run and the migration list in the job summary. A missing `SUPABASE_DB_URL`, or `BACKUP_AGE_RECIPIENT` when applying, fails the run. The database URL is given only to the steps that need it, as an environment variable; the password is masked and connection strings are redacted from the output. Procedure: [release](../../docs/process/release.md#database-migrations), [operations §6](../../docs/operations.md#6-database-migrations).
- **ENV-09** Actions pinned to commit SHAs; minimal `permissions`.

## 4. Observability (v0-appropriate)

- **ENV-10** Extension: structured log helper with levels; debug level only in dev builds; last sync error kept in storage and shown in the popup tooltip.
- **ENV-11** Dashboard: Vercel runtime logs; route handlers log errors without PII; React error boundaries with a friendly fallback. No third-party error tracking in v0. Amended 2026-11-12 (grill H1): `error.tsx` and `global-error.tsx` report the error class name and Next.js digest (never the message) to `POST /api/client-error`, and `instrumentation.ts` `onRequestError` logs the route pattern, class name and digest; both write one coarse JSON line to the Vercel runtime log (`logServerError`). The endpoint is public, same-origin, ≤ 512 bytes, schema-checked and rate-limited per instance.
