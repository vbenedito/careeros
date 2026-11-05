# CareerOS

[![CI](https://github.com/vbenedito/careeros/actions/workflows/ci.yml/badge.svg)](https://github.com/vbenedito/careeros/actions/workflows/ci.yml)

Track and understand your technical-interview study time — automatically and privately.

> **Status: v0 in implementation (Gate 3).** Specs and backlog are approved; features below are planned, not yet implemented.

## What v0 will do (planned)

- A **Chrome extension** that measures time on the study sites you choose, pausing when you are inactive, switch tabs or leave Chrome.
- A **web dashboard** (Next.js) with your study time by day and by platform.
- Sign in with **Google or GitHub**; your data is visible only to you and can be deleted at any time.

## Planned architecture

pnpm monorepo · Chrome MV3 extension (TypeScript, React, Tailwind) · Next.js dashboard (shadcn/ui, Recharts) · Supabase (Postgres + RLS + Auth) · Docker-based local backend · GitHub Actions CI.

See [`docs/architecture.md`](docs/architecture.md) and the [ADRs](docs/adr/).

## How this project is built

Specification-Driven Development with explicit approval gates:

1. Understanding & direction — *approved*
2. v0 specs & backlog — *approved* → [`specs/`](specs/), [`docs/backlog/v0.md`](docs/backlog/v0.md)
3. v0 implementation — **in progress**
4. v0 delivery
5. Further iterations only on request — [`docs/roadmap.md`](docs/roadmap.md) lists candidates, none authorized

Rules for contributors and AI agents: [`AGENTS.md`](AGENTS.md).

## Setup

Requirements: **Node.js 26 LTS** (see `.nvmrc`; `nvm use`) and **pnpm 12** (`corepack enable` picks the version pinned in `package.json`). Docker Desktop is needed for backend work (from issue #3).

```bash
pnpm install
pnpm check        # lint + typecheck + unit tests
pnpm build        # builds every workspace that has a build step
pnpm --filter @careeros/web dev   # dashboard on http://localhost:3000
```

### Local backend (Supabase in Docker)

Requires **Docker Desktop running**. The Supabase CLI is a dev dependency, so no global install is needed.

```bash
pnpm db:start     # start Postgres, Auth, PostgREST, Studio, Mailpit in Docker
pnpm db:status    # print the local API URL, keys and Studio URL
pnpm db:reset     # re-apply supabase/migrations + supabase/seed.sql
pnpm db:test      # run pgTAP tests in supabase/tests/database
pnpm db:stop      # stop the containers (data volumes are kept)
```

Then copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the values from `pnpm db:status`. To try real Google/GitHub sign-in locally, see [`docs/guides/oauth-setup.md`](docs/guides/oauth-setup.md); automated tests don't need it. Local services: API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`, Mailpit (captured e-mails) `http://127.0.0.1:54324`.

The first `db:start` pulls several Docker images (a few GB) and can take a few minutes. Realtime, Storage, Edge Functions and Analytics are disabled in `supabase/config.toml` because v0 doesn't use them.

### Chrome extension (unpacked)

```bash
pnpm --filter @careeros/extension build        # dev build  → apps/extension/dist/development
VITE_DASHBOARD_ORIGIN=https://<dashboard> pnpm --filter @careeros/extension release   # prod zip
```

Load it in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `apps/extension/dist/development`. After rebuilding, click the reload icon on the extension card.

The extension ID is pinned by a public key in the manifest, so it is the same on every machine:

| Build | Name | Extension ID |
|---|---|---|
| development | CareerOS (dev) | `jfklbpedlpkginmdfckogdgaggmdmkbk` |
| production | CareerOS | `negamegjachlkaemamlfhaecippkncbl` |

Both can be installed side by side. Permissions are exactly `alarms`, `idle`, `storage`, `tabs` (SEC-03, enforced by a test).

### Repository layout

```
apps/extension   Chrome MV3 extension
apps/web         Next.js dashboard
packages/shared  rules, schemas and constants used by both apps
specs/ docs/     specifications, ADRs, roadmap, backlog
```

### Toolchain versions

| Tool | Version | Note |
|---|---|---|
| Node.js | 26 LTS | Active LTS since Oct 2026; Vercel default runtime for new projects |
| pnpm | 12.16.1 | `minimumReleaseAge` supply-chain policy left at its default; dependencies are pinned exactly |
| TypeScript | 6.0.3 | 7.x (native compiler) skipped for now: Next.js and editor tooling rely on the 6.x JS API |
| Next.js / React | 16.4.4 / 19.3.1 | |
| Vitest | 5.1.0 | |
| Biome | 2.6.4 | single lint + format tool (React, Next.js and test rule domains) |
| Supabase CLI | 3.0.0 | dev dependency; local stack runs in Docker (ADR-0008) |
| Vite | 8.3.5 | extension build (MV3 service worker + popup) |
