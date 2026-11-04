# CareerOS

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

Will be documented when implementation starts.
