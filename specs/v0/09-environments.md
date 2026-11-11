# 09 — Environments, Tooling & CI

Status: **Approved (2026-11-04)** · Related ADRs: 0001 (monorepo), 0008 (Docker-based local backend)

Amended 2026-11-11 (#131): repository layout, Node version, environment variables (ENV-05b), CI jobs (ENV-08) and the backup workflow, to match the repository.

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
├─ docs/                  architecture, ADRs, roadmap, backlog, guides
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
| **Production** | Supabase Cloud project (free tier) | Vercel (free tier) | prod build, unpacked, distributed as a zip from GitHub Releases |

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
| `EXTENSION_INSTALL_URL` | web | Optional; must be https. The landing page's install link; without it, the Chrome Web Store search for CareerOS |
| `PRIVACY_CONTROLLER`, `PRIVACY_CONTACT_EMAIL`, `DATA_REGION` | web | Shown on `/privacy` (SEC-13). Optional locally (a "not configured" marker is shown); `next.config.ts` fails the build when any is missing and `VERCEL_ENV=production` |
| `VITE_DASHBOARD_ORIGIN` | extension | Required; an origin without path, https in production builds |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | extension | Required (https URL, `sb_publishable_…` key) in production builds; development builds may omit them and report "not configured". Values that look like secrets fail the build |

- **ENV-05a** Releases: semantic version in `manifest.json`; each release is a GitHub Release with the prod zip and install/update instructions (load unpacked → replace folder → reload). Updates are manual in v0; AUTH-07a surfaces outdated builds.
- **ENV-06** Local OAuth: the local stack is used with seeded users (admin API) for development and tests; optionally a GitHub OAuth app for `localhost` can be configured, documented but not required.
- **ENV-07** The dashboard is **not** containerized in v0 (Vercel builds it natively); Docker is used for the backend stack, database tests and CI parity (ADR-0008).

## 3. CI (GitHub Actions)

- **ENV-08** Workflow `.github/workflows/ci.yml` on pull requests and pushes to `main` (Node from `.nvmrc`, pnpm from `packageManager`):
  1. `checks` ("Lint, typecheck, test, build"): install (`--frozen-lockfile`, cached pnpm store) → `pnpm lint` (Biome) → `pnpm typecheck` → `pnpm test:coverage` (Vitest with the TEST §3 thresholds) → `pnpm build` (extension development build and dashboard).
  2. `backend` ("Database (Supabase in Docker)"): install → `supabase start -x studio,postgres-meta` → `pnpm db:reset` → `pnpm db:test` (pgTAP) → install Playwright's Chromium (cached) → `scripts/ci/integration.sh` (builds the dashboard and the extension, starts one dashboard server, runs the web integration, extension integration and E2E suites) → backup → restore round trip (`scripts/ops/backup-restore-test.sh`, `age` pinned by checksum) → on failure, print the dashboard server log → `supabase stop`.

  Workflow `.github/workflows/backup.yml` runs weekly (Mondays 06:17 UTC) and on demand, only on `main`, in the GitHub environment `production-backup`: it dumps the production database (`scripts/ops/db-dump.sh`), encrypts it with `age` and stores it as an artifact for 90 days. Without `SUPABASE_DB_URL` and `BACKUP_AGE_RECIPIENT` it skips.
- **ENV-09** Actions pinned to commit SHAs; minimal `permissions`.

## 4. Observability (v0-appropriate)

- **ENV-10** Extension: structured log helper with levels; debug level only in dev builds; last sync error kept in storage and shown in the popup tooltip.
- **ENV-11** Dashboard: Vercel runtime logs; route handlers log errors without PII; React error boundaries with a friendly fallback. No third-party error tracking in v0.
