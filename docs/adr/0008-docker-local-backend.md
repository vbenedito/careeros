# ADR-0008 — Docker-based local backend via Supabase CLI

Status: Accepted · Date: 2026-11-04

## Context
The product owner wants Docker in the development process. The backend (Postgres, Auth, RLS) must be developed and tested without touching production, and CI should run the same stack.

## Options
1. Develop against a cloud Supabase project — no Docker; slow feedback; shared state; risk to real data.
2. **Supabase CLI local stack** — runs Postgres, GoTrue (Auth), PostgREST, Studio, Inbucket in Docker; `supabase db reset` applies migrations + seed; `supabase test db` runs pgTAP.
3. Hand-written docker-compose — full control; re-implements what the CLI already provides.
4. Also containerize the Next.js app — useful for self-hosting; not needed with Vercel.

## Decision
Option 2 on Docker Desktop locally and on GitHub Actions runners. The dashboard and extension run natively (`next dev`, Vite). A dashboard Dockerfile is out of scope for v0.

## Consequences
+ Reproducible backend, migrations as code, CI parity, zero cloud cost in development.
− Requires Docker Desktop running (~2 GB images) for database work.
