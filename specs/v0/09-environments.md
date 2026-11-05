# 09 — Environments, Tooling & CI

Status: **Approved (2026-11-04)** · Related ADRs: 0001 (monorepo), 0008 (Docker-based local backend)

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
├─ specs/                 SDD specifications
├─ docs/                  architecture, ADRs, roadmap, backlog, guides
├─ .github/workflows/     CI
├─ AGENTS.md
└─ README.md
```

- **ENV-01** Package manager **pnpm** workspaces; no build orchestrator (Turborepo/Nx) in v0 — `pnpm -r` is enough at this size.
- **ENV-02** TypeScript `strict` everywhere, shared base `tsconfig`. Lint/format with **Biome** only (one fast tool instead of ESLint + Prettier), using its `react`, `next` and `test` rule domains; **no ESLint** (decided in #1: Biome 2.6 covers the Next.js rules we need). Markdown is not formatted by Biome.
- **ENV-03** Versions: Node LTS (pinned in `.nvmrc` / `engines`), latest stable Next.js, React, supabase-js at Gate 3 start, recorded in the README.

## 2. Environments

| Env | Backend | Dashboard | Extension build |
|---|---|---|---|
| **Local** | Supabase CLI stack in **Docker Desktop** (`supabase start`: Postgres, Auth, Studio, Inbucket) | `next dev` on `http://localhost:3000` | dev build, `externally_connectable` → localhost:3000, Supabase → local |
| **Production** | Supabase Cloud project (free tier) | Vercel (free tier) | prod build, unpacked, distributed as a zip from GitHub Releases |

- **ENV-04** No staging in v0.
- **ENV-05** Configuration via env files (`.env.local`, never committed; `.env.example` committed). The extension's build-time config (dashboard origin, Supabase URL + publishable key, extension `key`) is injected by Vite per mode. Dev and prod builds use **different** manifest keys (different IDs, installable side by side; each dashboard env knows its own ID).
- **ENV-05a** Releases: semantic version in `manifest.json`; each release is a GitHub Release with the prod zip and install/update instructions (load unpacked → replace folder → reload). Updates are manual in v0; AUTH-07a surfaces outdated builds.
- **ENV-06** Local OAuth: the local stack is used with seeded users (admin API) for development and tests; optionally a GitHub OAuth app for `localhost` can be configured, documented but not required.
- **ENV-07** The dashboard is **not** containerized in v0 (Vercel builds it natively); Docker is used for the backend stack, database tests and CI parity (ADR-0008).

## 3. CI (GitHub Actions)

- **ENV-08** Workflow `.github/workflows/ci.yml` on pull requests and pushes to `main` (Node from `.nvmrc`, pnpm from `packageManager`):
  1. `checks`: install (cached pnpm store) → Biome → `tsc --noEmit` → Vitest → build extension and dashboard.
  2. `backend`: `supabase start` (Docker on the runner) → `supabase db reset` → `supabase test db` → integration tests → Playwright E2E. Artifacts: Playwright report on failure.
- **ENV-09** Actions pinned to commit SHAs; minimal `permissions`.

## 4. Observability (v0-appropriate)

- **ENV-10** Extension: structured log helper with levels; debug level only in dev builds; last sync error kept in storage and shown in the popup tooltip.
- **ENV-11** Dashboard: Vercel runtime logs; route handlers log errors without PII; React error boundaries with a friendly fallback. No third-party error tracking in v0.
