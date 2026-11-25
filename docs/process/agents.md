# Agents: model routing and token budget

Status: **Current** (product owner, 2026-11-12) · Owner: tech lead · Applies to every session that delegates work to sub-agents.

Amended 2026-11-18 (#212): §6 ledger rule (ADM-14) and the "Skills used" rule (#199).

Amended 2026-11-20 (#239, product owner): user-facing product copy is approved by a specialist copy review agent, like marketing documents (§2).

Amended 2026-11-21 (#252, product owner): every sub-agent reports the skills it used (§6).

Amended 2026-11-25 (#268, product owner P6): the auto-merge workflow merges post records after a marketing review agent's approval; the product owner keeps a veto (§7).

Amended 2026-11-22 (#267): posts pipeline rules, no agent approves a post record and workflow changes need an `ops-workflow:` PR (§7, PST-08, PST-32).

The goal is the same or better quality for fewer tokens. Pick the model by the **risk and kind of thinking** a task needs, not by how important the project is.

## 1. Which model

| Work | Model | Examples |
|---|---|---|
| Mechanical or read-only: find, list, fetch logs, check links, capture screenshots, reformat | **Haiku** | CI log triage, file inventories, link checks, screenshot capture, issue text clean-up |
| Well-specified building and standard reviews (the default) | **Sonnet** | UI and copy changes, tests, docs, migrations from a clear spec, most PR reviews, marketing drafts and variants |
| Ambiguous or high-risk reasoning | **Opus** | Sync, auth and data-integrity design; security reviews; concurrency; architecture and ADRs; deep reviews of risky PRs; launch strategy |
| Orchestration, decisions, talking to the product owner | Main thread | Plans, questions, integration, merges. Delegates bulk reading instead of doing it |

When unsure, start on Sonnet. Escalate to Opus only when the task touches data integrity, security or concurrency, or when a Sonnet attempt fails twice.

## 2. Review depth by risk

Replaces the blanket "independent review by a different agent" rule (AGENTS.md §2.5).

| Change | Review |
|---|---|
| Marketing documents (`docs/marketing/`, brand assets) | One specialist review agent (marketing or brand reviewer, Sonnet). It **approves instead of the product owner** (product owner decision, 2026-11-17, #198): if nothing HIGH or MEDIUM is left, the tech lead merges |
| User-facing product copy (dashboard and extension texts, privacy page, landing page, store listing) | One specialist copy review agent (UX writing or privacy-copy reviewer, Sonnet). It **approves the wording instead of the product owner** (product owner decision, 2026-11-20, #239). It checks the texts against the specs and the [voice](../marketing/voice.md). The product owner still decides behaviour, scope and anything that changes what the product claims to store or do; the code PR still needs the product owner's "approved" |
| Docs, copy, version bumps, config with no behaviour change | CI + the tech lead's own check; no review agent (spec changes to product behaviour: one Sonnet review) |
| Normal code (UI, dashboard, tests, tooling) | One Sonnet review |
| Sync, auth, security, database migrations, CI workflows that hold secrets | One Opus deep review |
| Re-review after fixes | Same reviewer, **new diff only** |

## 3. Rules that save the most

1. **Prompts carry the facts.** Give file paths, findings and decisions already known, so the agent doesn't re-discover the repo. Ask for a short reply with a word limit.
2. **Fix with the same agent.** Send fixes to the agent that built the change (it keeps its context) instead of starting a new one.
3. **At most two agents at once,** and only on work that doesn't overlap (separate git worktrees). Long parallel runs hit the 5-hour usage limit.
4. **CI is the verifier.** Agents run lint, typecheck and unit tests; integration and end-to-end suites run in CI, not again in a sandbox.
5. **Screenshots:** scale 1 for checks; scale 2 only for images the product owner will look at. Look at the fewest images that answer the question.
6. **Batch small changes** into one PR instead of one PR each.
7. **Ask before producing.** Product decisions go to the product owner in a short grilling round first (`docs/process/contributing.md`), so work isn't produced twice.

## 4. Quality never goes down

Saving tokens must not lower quality. Three safeguards:

1. **Automate what a reviewer would check mechanically.** Every check a review agent keeps repeating becomes a test or a CI step, which costs no tokens and runs on every PR. Today's automated checks: lint, typecheck, spec-ID traceability (`pnpm check:spec-trace`, TEST-02: tests may only cite IDs defined in `specs/`; untested IDs are reported), unit tests with coverage thresholds, docs-parity tests, chart-contrast test, responsive layout (TEST-01: landing, privacy, sign-in, dashboard, settings, `/admin`), Markdown link check (`pnpm check:links`, #155), store package check (`pnpm check:store-package`, #156), pgTAP, integration and E2E, backup → restore round trip. No further candidates are open.
2. **Escalate on signals, never downgrade on them.** A task moves up one model (or gets a deeper review) when: CI fails after a review approved it; a review finds a correctness or data-loss bug; the change grows beyond its issue; or a fix needs a second round. Product-behaviour changes in specs always get a review agent, even when the PR is "docs only".
3. **Learn from every escaped defect.** When something passes review and fails later (in CI, production or the product owner's check), the fix PR also adds the check that would have caught it, and this page is updated if the routing was wrong. Examples so far: docs-parity tests (#132), the responsive checks (#143), the integration test that caught the delete-account 401 (#152).

## 5. Content work (videos, social posts)

- Settle the brand profile and voice **once**; every content skill reads them instead of rediscovering them.
- Drafts, hooks, captions and variants on Sonnet or Haiku. Opus only for positioning and launch strategy.
- Visuals and video in their dedicated tools; iterate on the specific asset, don't regenerate everything.
- Get decisions (angle, audience, format) before generating assets.
- Marketing documents are approved by a specialist review agent, not the product owner (§2). Facts the product owner owns (accounts, domain, budget, anything said in the product's name that changes product behaviour) still go to the product owner.

## 6. Measuring

Each sub-agent reports its token use when it finishes. The tech lead watches for outliers (an agent above ~200k tokens on a well-specified task is a sign the prompt lacked facts). In a session, `/explain-usage` shows where the tokens went.

**Ledger (ADM-14, product owner 2026-11-18).** Before a session ends, the main session writes one JSON file with its records (session goal; per agent: model, work, kind, issue, PR, tokens, minutes, rounds, first-round HIGH/MEDIUM findings, files given and skills used) and pushes it to the private repo `vbenedito/careeros-ops` under `ledger/YYYY/` (schema: [spec ADM-06](../../specs/v1/03-admin.md), [ADR-0013](../adr/0013-admin-access.md)). Sub-agent tokens are the exact numbers each agent reports at its last finish; main-session tokens are an estimate unless measured with `/explain-usage`. Files are never edited; a correction is a new file. The ledger never goes in this public repository. If the session cannot push, it says so in its last message to the product owner.

**Skills used (#199, widened 2026-11-21, #252).** Every sub-agent, build and review alike, loads the skills that match the work and starts its report with `Skills used: …` (or `Skills used: none`). The tech lead puts that line in the PR description and the merge comment, tells the product owner which skills each piece of work used, and records them in the ledger (`skills`, ADM-06).

## 7. Posts pipeline (PST-08, PST-32)

Spec: [04-posts-pipeline](../../specs/v1/04-posts-pipeline.md). The private ops repo `vbenedito/careeros-ops` holds the post records, state and workflows.

- **Records are merged only by the auto-merge workflow (PST-08, PST-35; amended 2026-11-25, P6).** Claude writes a post record and opens it as a PR in the ops repo at least 20 h before the post. A **marketing review agent** (Sonnet, §2) checks the texts against `voice.md`, brand profile §6 and §11 and video formats §4.6, and posts the approval comment for the head SHA it read (PST-37). The reviewed workflow `posts-auto-merge` merges at post time − 2 h when the check is green, the approval is there and nothing has the label `hold`. No Claude session merges or pushes a record to `main` itself. The product owner's `hold` label stops a post at any time (PST-36).
- **Workflow changes (PST-32).** Agents never create or edit anything under `.github/` in the ops repo, except in a PR whose title starts with `ops-workflow:`. That PR is reviewed by Opus (§2) and merged only after the product owner's "approved".
