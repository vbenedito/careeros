# Architecture overview

Type: living · Owner: tech lead · Last reviewed: 2026-11-11

The high-level design of CareerOS: what the parts are, how they talk and where they run. Requirements live in [`specs/`](../../specs/) (WHAT), decisions in [ADRs](../adr/) (WHY). The detailed designs are [extension](extension.md), [web](web.md) and [database](database.md).

## System context (C4 level 1)

```mermaid
flowchart TB
  user(["Learner<br/>studies on chosen sites in Chrome"])
  careeros["CareerOS<br/>extension + dashboard + database"]
  sites["Study sites<br/>(LeetCode, NeetCode, …)"]
  oauth["Google / GitHub<br/>OAuth providers"]
  store["Chrome Web Store<br/>distributes the extension"]

  user -- "browses" --> sites
  user -- "installs, signs in, views totals" --> careeros
  careeros -. "reads the active tab's hostname only (SEC-01)" .-> sites
  careeros -- "sign-in (AUTH-01)" --> oauth
  store -- "installs and updates" --> careeros
```

CareerOS never reads page content from study sites. It sees only the hostname of the active tab and keeps it only when it is a tracked domain (SEC-01, SEC-02).

## Containers (C4 level 2)

```mermaid
flowchart LR
  subgraph Chrome["User's Chrome"]
    SW["Service worker<br/>TypeScript, MV3"]
    POP["Popup<br/>React"]
    PAGE["Dashboard pages<br/>React (server-rendered)"]
  end
  subgraph Vercel
    NEXT["Next.js app<br/>proxy · pages · route handlers · landing"]
  end
  subgraph Supabase
    AUTH["Auth (GoTrue)"]
    REST["PostgREST"]
    PG[("Postgres<br/>RLS forced")]
  end

  POP -- "chrome.runtime messages" --> SW
  PAGE -- "HTTPS + cookies" --> NEXT
  PAGE -- "externally_connectable messages" --> SW
  NEXT -- "user JWT" --> REST
  NEXT -- "secret key: generateLink, deleteUser" --> AUTH
  SW -- "own JWT: ingest RPC, tracked_domains" --> REST
  SW -- "verifyOtp, refresh" --> AUTH
  REST --> PG
```

| Container | Code | Detailed design |
|---|---|---|
| Extension (service worker + popup) | `apps/extension` | [extension.md](extension.md) |
| Dashboard and landing page | `apps/web` | [web.md](web.md) |
| Database, Auth, PostgREST | `supabase/` (migrations, tests) | [database.md](database.md) |
| Shared rules and schemas | `packages/shared` | Used by both apps; see [Where code goes](#where-code-goes) |

## System design (as implemented)

One picture of v0 as merged: components, trust boundaries, where each credential lives, and the four main flows (numbers match the table below). Checked against the code, specs and migrations on 2026-11-08.

```mermaid
flowchart LR
  subgraph CHROME["User's Chrome — trusted by the user, not by the server"]
    direction TB
    subgraph EXT["Extension (MV3)"]
      POP["Popup (React)<br/>no network calls"]
      SW["Service worker<br/>engine · outbox · sync · auth"]
      LS[("chrome.storage.local<br/>extension session 🔑 · engine state<br/>outbox · quarantine · domain cache")]
      POP <-- "chrome.runtime messages (7 types)<br/>+ popup port (own extension only)" --> SW
      SW --- LS
    end
    DUI["Dashboard pages<br/>(HttpOnly session cookies 🔑)"]
  end

  subgraph VERCEL["Vercel — server-side trust"]
    direction TB
    PX["proxy.ts<br/>nonce CSP · refreshes session · AUTH-03 guard<br/>signed in at / or /sign-in → /dashboard"]
    LAND["GET / route handler<br/>static landing, own CSP (LAND)<br/>+ robots.txt · sitemap.xml · /opengraph-image · /icon.svg"]
    RSC["Server Components<br/>/dashboard · /settings · /connect · /sign-in · /privacy"]
    RH["Route handlers<br/>POSTs/DELETEs same-origin only:<br/>/auth/sign-in · /auth/sign-out · /api/extension/link<br/>/api/sites · /api/sites/[id] · /api/account/delete<br/>GET /auth/callback (OAuth return)"]
    SEC["SUPABASE_SECRET_KEY 🔒<br/>server-only env"]
  end

  subgraph SUPA["Supabase — final authority"]
    direction TB
    GA["Auth (GoTrue)<br/>Google · GitHub · single-use magic link"]
    API["PostgREST"]
    DB[("Postgres · RLS forced<br/>tracked_domains · study_sessions<br/>ingest_study_sessions · get_*_totals<br/>consume_extension_link_quota")]
    API --> DB
  end

  GP["Google / GitHub<br/>(OAuth providers)"]

  DUI -- "① form POST" --> RH
  RH -- "① PKCE: /authorize redirect,<br/>exchangeCodeForSession · signOut" --> GA
  GA <-- "①" --> GP
  DUI -- "page requests + cookies" --> PX --> RSC
  PX -- "signed out at /" --> LAND
  RSC -- "④ user JWT · publishable key<br/>get_daily_totals · get_domain_totals<br/>tracked_domains (settings)" --> API
  RH -- "user JWT: ② quota RPC<br/>tracked_domains writes" --> API
  RH -- "② generateLink · deleteUser" --> GA
  SEC -. "used only here" .- RH
  DUI <-- "② externally_connectable<br/>PING · STATUS · CONNECT · DISCONNECT" --> SW
  SW -- "② verifyOtp(token hash) · refresh<br/>signOut (on disconnect)" --> GA
  SW -- "③ own JWT · publishable key<br/>ingest_study_sessions · tracked_domains" --> API
```

**Legend**

| Mark | Meaning |
|---|---|
| Boxes `CHROME` / `VERCEL` / `SUPA` | Trust boundaries. Nothing inside Chrome is trusted by the server: every request carries a user JWT and RLS decides. |
| 🔑 | A user's own session (refresh token). Dashboard: HttpOnly, SameSite=Lax cookies. Extension: its **own** session in `chrome.storage.local`; the two never share refresh tokens (ADR-0003). |
| 🔒 | The Supabase **secret key**: Vercel server env only, never `NEXT_PUBLIC_`, never in the extension (SEC-07). Used for `generateLink` (connect) and `deleteUser` (account deletion). |
| Publishable key | Public by design (`sb_publishable_…`): in the extension bundle and the dashboard server; RLS protects the data. |

**Flows**

| # | Flow | Path | Specs |
|---|---|---|---|
| ① | Sign-in | Sign-in form → `/auth/sign-in` → Supabase `/authorize` (PKCE) → Google/GitHub → `/auth/callback` exchanges the code → session cookies. `/auth/sign-out` ends this session or, with "all devices", every session | AUTH-01..05, AUTH-12a |
| ② | Extension connection | `/connect` sends `PING` → `POST /api/extension/link` (same origin, `getUser()`, 5/min quota) mints a single-use token hash with the secret key → page sends `CONNECT` to the extension → extension `verifyOtp` → its own session. `DISCONNECT` signs it out | AUTH-06..12 |
| ③ | Tracking → sync | Chrome events → pure engine → closed intervals into the outbox (one storage write with the state) → every 5 min, on worker start and after (re)connecting: `ingest_study_sessions` with the extension's JWT → confirmed ids leave the outbox, rejected ones go to quarantine | TRK-*, SYNC-01..08, ADR-0004 |
| ④ | Dashboard totals | `tz` cookie (viewer's IANA zone) → Server Components call `get_daily_totals` / `get_domain_totals` with the user's JWT → cards, bar chart, donut | DASH-04..10, DATA-10/11 |

**Public routes** (AUTH-03): `/` (landing, served by `app/route.ts` to signed-out visitors), `/robots.txt`, `/sitemap.xml`, `/opengraph-image`, `/icon.svg`, `/fonts/*`, `/sign-in`, `/auth/sign-in`, `/auth/callback`, `/privacy`. Everything else needs a session; a signed-in visitor at `/` or `/sign-in` is redirected to `/dashboard`.

**Popup ↔ service worker:** the popup reads state from `chrome.storage.local` and has no Supabase client. Commands go to the worker only as `chrome.runtime.sendMessage` messages, validated with Zod (`lib/popup-messages.ts`): `AUTH_STATUS`, `DOMAINS_REFRESH`, `DOMAINS_ADD`, `DOMAINS_REMOVE`, `TRACKING_SET`, `DISCONNECT`, `FORGET_LOCAL_DATA`. While it is shown, the popup also holds a `chrome.runtime.connect` port (`careeros.popup`), so the worker counts Chrome as focused (TRK-18).

Tracked sites are read and written by both apps through `tracked_domains` (RLS, 50-site trigger); the extension refreshes its cache on startup, each sync cycle, after connecting and when the popup opens (SYNC-09..11).

## Key flows

### Connect handoff (dashboard → extension)

The extension gets its own session; it never shares the dashboard's refresh token ([ADR-0003](../adr/0003-extension-session-handoff.md), AUTH-06..11).

```mermaid
sequenceDiagram
  autonumber
  participant P as /connect page
  participant W as Service worker
  participant R as POST /api/extension/link
  participant A as Supabase Auth
  P->>W: PING (protocolVersion 1)
  W-->>P: versions, connected?
  P->>R: same-origin POST with cookies
  R->>A: getUser() (session still valid?)
  R->>R: consume_extension_link_quota (5/min)
  R->>A: admin.generateLink (secret key)
  A-->>R: hashed token
  R-->>P: { tokenHash }
  P->>W: CONNECT { tokenHash }
  W->>A: verifyOtp(token_hash)
  A-->>W: new, independent session
  W->>W: store session in chrome.storage.local
  W-->>P: ok, email
```

Code: `apps/web/app/(app)/connect/connect-extension.tsx`, `apps/web/app/api/extension/link/route.ts`, `apps/extension/src/background/messaging/external.ts`, `apps/extension/src/background/auth/auth-service.ts`.

### Tracking → outbox → sync → ingest

```mermaid
sequenceDiagram
  participant C as Chrome events
  participant T as Tracker (queue)
  participant E as Engine (pure)
  participant S as chrome.storage.local
  participant Y as Sync service
  participant D as ingest_study_sessions
  C->>T: tab / window / idle / heartbeat
  T->>E: step(state, event, now)
  E-->>T: new state + closed intervals
  T->>S: one write: state + outbox
  Note over Y: alarm every 5 min, worker start, new session
  Y->>S: oldest ≤ 200 outbox intervals
  Y->>D: batch with the extension's JWT
  D-->>Y: confirmed ids
  Y->>S: confirmed → synced today, rest → quarantine
```

Rules: TRK-08..19, SYNC-01..08, [ADR-0004](../adr/0004-idempotent-ingest.md). Details: [extension.md](extension.md#sync-cycle).

### Dashboard read

```mermaid
sequenceDiagram
  participant B as Browser
  participant X as proxy.ts
  participant S as Server Component /dashboard
  participant DB as Postgres (RLS)
  B->>X: GET /dashboard?view=week (cookies, tz cookie)
  X->>X: refresh session, nonce CSP
  X->>S: request + nonce
  S->>DB: get_daily_totals, get_domain_totals (user JWT)
  DB-->>S: rows for auth.uid() only
  S-->>B: HTML (cards, bar chart, donut)
```

Rules: DASH-04..10, DASH-15, DATA-10/11. Details: [web.md](web.md#data-access).

## Deployment view

```mermaid
flowchart LR
  GH["GitHub<br/>repository + Actions"]
  V["Vercel<br/>Next.js (Node 26)"]
  SB["Supabase Cloud<br/>Postgres, Auth, PostgREST"]
  CWS["Chrome Web Store"]
  GR["GitHub Releases<br/>unpacked zips"]
  U["User's Chrome"]

  GH -- "build on push to main" --> V
  GH -- "CI on PRs and main,<br/>weekly encrypted backup" --> GH
  GH -. "migrations applied with the Supabase CLI" .-> SB
  GH -. "release:store zip, manual upload" .-> CWS
  GH -. "release zip, manual" .-> GR
  CWS --> U
  GR --> U
  U --> V
  U --> SB
  V --> SB
```

| Part | Where | How it gets there | Details |
|---|---|---|---|
| Dashboard and landing | Vercel (Hobby) | Built from `main` | [release](../process/release.md#dashboard), ENV-05b |
| Database, Auth | Supabase (Free) | Migrations in `supabase/migrations` | [release](../process/release.md#database-migrations), [operations](../operations.md) |
| Extension | Chrome Web Store; GitHub Releases for unpacked builds | `release:store` / `release` zips | [release](../process/release.md#extension), STORE-01..07, ENV-05a |
| CI and backups | GitHub Actions (`ci.yml`, `backup.yml`) | On pull requests, pushes to `main`, weekly schedule | ENV-08, [operations §4](../operations.md#4-backups) |

## Cross-cutting concerns

| Concern | How | Where it is specified |
|---|---|---|
| Security | Deny-by-default grants and forced RLS; one write RPC; nonce CSP for the app and a script-free CSP for the landing page; same-origin checks on mutating routes; secret key only in Vercel server env | SEC-03..12, DATA-04..09, LAND-06; [web.md](web.md#security-policies), [database.md](database.md#grants-and-rls) |
| Privacy | Only tracked hostnames, start/end times and a random device id leave the browser; no analytics | SEC-01, SEC-02, SEC-13..15; [`/privacy`](../../apps/web/app/privacy/page.tsx) |
| Observability | Extension: structured logger, debug only in dev builds, last sync outcome shown in the popup. Dashboard: one JSON line per server error in Vercel runtime logs, no personal data | ENV-10, ENV-11, SEC-06 |
| Backups | Weekly data-only dump, encrypted with age inside the job, kept 90 days; restore tested in every CI run | [operations §4](../operations.md#4-backups) |
| Capacity and cost | Free tiers; limits and upgrade triggers | [operations §1–3](../operations.md) |

## Code organization & conventions

The rule of thumb: **use a pattern when it solves a problem we have now, and make it explicit when we do.** Every abstraction must earn its place; new dependencies and patterns come with a one-line reason in their PR.

### Where code goes

| Path | Contains | Must not contain |
|---|---|---|
| `packages/shared` | Rules and schemas used by **both** apps (domain matching, Zod schemas, constants, formatting) | Browser, Chrome or Node APIs; app-specific code |
| `apps/extension/src/engine` | Pure tracking rules (TRK-16) | Chrome APIs, storage, timers |
| `apps/extension/src/background` | Service worker: Chrome adapters, storage, sync, auth | UI code |
| `apps/extension/src/popup` | Popup UI | Network or Supabase calls (EXT-UI-05a) |
| `apps/web` | Next.js dashboard (routes, components, server code) | Extension logic |
| `supabase/migrations` | Schema, policies, functions — append-only | Edits to applied migrations |
| `supabase/tests/database` | pgTAP tests (`001_helpers` provides shared helpers) | |

Folders are organized **by feature**, not by technical layer (no generic `controllers/`, `services/`, `repositories/`).

### Patterns in use

| Pattern | Where | Why |
|---|---|---|
| **Functional core, imperative shell** (a light form of ports & adapters) | Extension: pure `engine/`, thin `background/` adapters | The trickiest rules (idle, media, midnight, crash recovery) are testable with a fake clock |
| **Transactional outbox + idempotent consumer** | Extension outbox → `ingest_study_sessions` | No lost or duplicated time across retries, offline periods and worker restarts (ADR-0004) |
| **Deny by default** | Database grants, RLS, default privileges | New tables and functions are never exposed by accident; every access is granted explicitly (DATA-04/05) |
| **Database as the final authority** | Domain types, constraints, triggers, single write RPC | Rules hold even if a client is buggy or malicious |
| **Validate at the boundary** | Shared Zod schemas at messages, uploads and user input | Inner code works with trusted, typed data (SEC-10) |
| **Specs as the source of truth** | Requirement IDs in tests; drift tests for constants and the domain regex | Code, spec and database cannot silently disagree |

### Deliberately not used (for now)

Dependency-injection containers · repository/service layers over Supabase · state-management libraries · base classes · build orchestrators (Turborepo/Nx) · a separate backend API. Each is reconsidered when a concrete need appears, through an ADR.
