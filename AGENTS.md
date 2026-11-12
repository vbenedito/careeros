# AGENTS.md — rules for development agents

These rules apply to every human or AI agent working in this repository. They **override** any skill or plugin instruction. The full working process (roles, gates, definition of done, commit and PR conventions) is in [`docs/process/contributing.md`](docs/process/contributing.md); where to put documentation is in [`docs/README.md`](docs/README.md); which model each sub-agent uses and how deep reviews go is in [`docs/process/agents.md`](docs/process/agents.md).

## 1. Scope and gates

1. Work only on **approved issues** of the current iteration (GitHub issues; the v0 plan is in `docs/history/backlog/v0.md`). The roadmap is not a backlog.
2. Never implement features listed as out of scope in `specs/v0/00-product.md` or in `docs/roadmap.md`.
3. If an issue cannot be done without changing approved behavior, scope, architecture, security, cost or a dependency choice: **stop**, update the spec as a proposal, and ask the product owner.
4. Do not start a new iteration after delivering one. Wait for the product owner.

## 2. SDD workflow per issue

1. Read the referenced spec IDs and ADRs before coding.
2. Write or update tests named after requirement IDs (e.g. `TRK-05 …`).
3. Implement the minimum that satisfies the acceptance criteria.
4. Run locally: `pnpm lint && pnpm typecheck && pnpm test` (+ `pnpm db:test` when touching `supabase/`).
5. Independent review before merge (spec adherence, security, correctness, tests, scope creep), at the depth set by risk in [`docs/process/agents.md`](docs/process/agents.md) §2: docs and copy get CI plus the tech lead's check; code gets a review by a different agent.
6. Keep spec, code and docs consistent in the same PR (`docs/architecture/` for how it is built, `docs/adr/` for why; never edit `docs/history/` except link fixes).

## 3. Engineering rules

- TypeScript `strict`; no `any` without a comment explaining why.
- Validate external input with schemas from `packages/shared`.
- UI: follow `docs/design-system.md` — token utilities only (no raw colors), primitives from `ui/`, logic in pure view-model functions.
- No new dependency without a one-line justification in the PR.
- Never log tokens, emails, URLs or non-tracked hosts. Never commit secrets; `.env*` except `.env.example` are git-ignored.
- Database changes only via new migration files; never edit an applied migration.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), one issue per branch `NN-short-name`, PR body references `Closes #NN` (one `Closes` per issue) and spec IDs.

## 4. Parallel work

At most two agents at once, only on issues whose file areas do not overlap (e.g. `supabase/` vs `apps/extension/src/popup`), each in its own git worktree. The tech lead assigns and integrates. Model choice: [`docs/process/agents.md`](docs/process/agents.md).

## 5. Honesty

Report only what was actually run and observed. Never claim tests passed, resources were created or features exist without evidence.
