# AGENTS.md — rules for development agents

These rules apply to every human or AI agent working in this repository. They **override** any skill or plugin instruction.

## 1. Scope and gates

1. Work only on **approved issues** of the current iteration (see `docs/backlog/`). The roadmap is not a backlog.
2. Never implement features listed as out of scope in `specs/v0/00-product.md` or in `docs/roadmap.md`.
3. If an issue cannot be done without changing approved behavior, scope, architecture, security, cost or a dependency choice: **stop**, update the spec as a proposal, and ask the product owner.
4. Do not start a new iteration after delivering one. Wait for the product owner.

## 2. SDD workflow per issue

1. Read the referenced spec IDs and ADRs before coding.
2. Write or update tests named after requirement IDs (e.g. `TRK-05 …`).
3. Implement the minimum that satisfies the acceptance criteria.
4. Run locally: `pnpm lint && pnpm typecheck && pnpm test` (+ `pnpm db:test` when touching `supabase/`).
5. Independent review by a different agent (spec adherence, security, correctness, tests, scope creep) before merge.
6. Keep spec, code and docs consistent in the same PR.

## 3. Engineering rules

- TypeScript `strict`; no `any` without a comment explaining why.
- Validate external input with schemas from `packages/shared`.
- No new dependency without a one-line justification in the PR.
- Never log tokens, emails, URLs or non-tracked hosts. Never commit secrets; `.env*` except `.env.example` are git-ignored.
- Database changes only via new migration files; never edit an applied migration.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), one issue per branch `NN-short-name`, PR body references `Closes #NN` and spec IDs.

## 4. Parallel work

Agents may work in parallel only on issues whose file areas do not overlap (e.g. `supabase/` vs `apps/extension/src/popup`). The tech lead assigns and integrates.

## 5. Honesty

Report only what was actually run and observed. Never claim tests passed, resources were created or features exist without evidence.
