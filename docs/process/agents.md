# Agents: model routing and token budget

Status: **Current** (product owner, 2026-11-12) · Owner: tech lead · Applies to every session that delegates work to sub-agents.

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
| Docs, copy, version bumps, config with no behaviour change | CI + the tech lead's own check; no review agent |
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

## 4. Content work (videos, social posts)

- Settle the brand profile and voice **once**; every content skill reads them instead of rediscovering them.
- Drafts, hooks, captions and variants on Sonnet or Haiku. Opus only for positioning and launch strategy.
- Visuals and video in their dedicated tools; iterate on the specific asset, don't regenerate everything.
- Get decisions (angle, audience, format) before generating assets.

## 5. Measuring

Each sub-agent reports its token use when it finishes. The tech lead watches for outliers (an agent above ~200k tokens on a well-specified task is a sign the prompt lacked facts). In a session, `/explain-usage` shows where the tokens went.
