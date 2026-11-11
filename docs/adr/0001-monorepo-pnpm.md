# ADR-0001 — pnpm monorepo without build orchestrator

Status: Accepted · Date: 2026-11-04

## Context
Two apps (extension, dashboard) share domain rules and validation schemas (domain normalization, interval schema, constants). Specs and docs should version together with code for SDD traceability.

## Options
1. Separate repositories — duplicated rules, cross-repo changes for one feature.
2. pnpm workspaces monorepo — one PR per feature, shared package, single CI.
3. Monorepo + Turborepo/Nx — task caching and graph; valuable at larger scale.

## Decision
Option 2. One `packages/shared` package only for code genuinely used by both apps. Revisit option 3 if CI time exceeds ~10 min or packages exceed ~4.

## Consequences
+ Atomic changes, simple tooling, easy for reviewers to follow.
− No task caching; acceptable at v0 size.
