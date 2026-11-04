# Specifications

CareerOS follows **Specification-Driven Development (SDD)**: a behavior is specified and approved here before it is implemented.

## Status

| Version | Status | Approved |
|---|---|---|
| v0 | **Approved** | 2026-11-04 |

Future ideas live in [`docs/roadmap.md`](../docs/roadmap.md). They are **not** specifications and do not authorize work.

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

## Conventions

- Every requirement has a stable ID (e.g. `TRK-07`). Issues, PRs, tests and ADRs reference these IDs.
- Requirement keywords: **MUST**, **SHOULD**, **MAY** (RFC 2119 meaning).
- Acceptance criteria are written as testable statements (`Given / When / Then` where useful).
- Constants live in one table per spec and are mirrored in `packages/shared` code; the spec is the source of truth.
- A change that contradicts an approved spec requires a spec update **first**, approved by the product owner when it changes behavior or scope.
- Architectural decisions with trade-offs are recorded in [`docs/adr/`](../docs/adr/).
