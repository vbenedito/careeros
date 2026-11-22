# Specifications

CareerOS follows **Specification-Driven Development (SDD)**: a behavior is specified and approved here before it is implemented.

## Status

| Version | Status | Approved |
|---|---|---|
| v0 | **Approved** | 2026-11-04 |
| Landing page (`LAND`) | **Approved** | 2026-11-11 |
| Chrome Web Store (`STORE`) | **Approved** | 2026-11-11 |
| v1 (`PRB`, `ENT`, v0 amendments) | **Proposed** | — |

Amended 2026-11-11 (#131): landing and store specs added to the status table and index.

Amended 2026-11-17 (#176): v1 row and v1 specification set (proposed).

Future ideas live in [`docs/roadmap.md`](../docs/roadmap.md). They are **not** specifications and do not authorize work: only the specs listed here do.

## v0 specification set

| # | Spec | Prefix |
|---|---|---|
| 00 | [Product scope](v0/00-product.md) | `PRD` |
| 01 | [Tracking engine](v0/01-tracking.md) | `TRK` |
| 02 | [Authentication](v0/02-auth.md) | `AUTH` |
| 03 | [Synchronization](v0/03-sync.md) | `SYNC` |
| 04 | [Data model & database](v0/04-data-model.md) | `DATA` |
| 05 | [Extension UI](v0/05-extension-ui.md) | `EXT-UI` |
| 06 | [Web dashboard](v0/06-dashboard.md) | `DASH` |
| 07 | [Security & privacy](v0/07-security-privacy.md) | `SEC` |
| 08 | [Testing strategy](v0/08-testing.md) | `TEST` |
| 09 | [Environments, tooling & CI](v0/09-environments.md) | `ENV` |

## v1 specification set

Proposed (#176). The v1 specs add to v0; the v0 specs they change carry an `Amended 2026-11-17 (#176)` line (TRK, SYNC, DATA, EXT-UI, DASH, SEC, ENV).

| # | Spec | Prefix |
|---|---|---|
| 00 | [Discovery record](v1/00-discovery.md) (decisions D1–D26; not a spec) | — |
| 01 | [LeetCode time per problem](v1/01-problems.md) | `PRB` |
| 02 | [Entitlements (plans and limits)](v1/02-entitlements.md) | `ENT` |
| 03 | [Internal admin dashboard](v1/03-admin.md) | `ADM` |
| 04 | [Automated social posts pipeline](v1/04-posts-pipeline.md) (accepted, #264) | `PST` |

## Later specifications

| Spec | Prefix |
|---|---|
| [Landing page](landing/00-landing.md) | `LAND` |
| [Chrome Web Store publication](store/00-chrome-web-store.md) | `STORE` |

## Conventions

- Every requirement has a stable ID (e.g. `TRK-07`). Issues, PRs, tests and ADRs reference these IDs.
- Requirement keywords: **MUST**, **SHOULD**, **MAY** (RFC 2119 meaning).
- Acceptance criteria are written as testable statements (`Given / When / Then` where useful).
- Constants live in one table per spec and are mirrored in `packages/shared` code; the spec is the source of truth.
- A change that contradicts an approved spec requires a spec update **first**, approved by the product owner when it changes behavior or scope.
- Architectural decisions with trade-offs are recorded in [`docs/adr/`](../docs/adr/).
