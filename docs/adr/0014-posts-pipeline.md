# ADR-0014 — Posts pipeline: public code, private data and secrets, GitHub Actions scheduler

Status: Proposed · Date: 2026-11-22 · Issue: #263 · Spec: [PST](../../specs/v1/04-posts-pipeline.md)

## Context
After the first post (2026-11-24, by hand), social posts must go out with minimum human interaction, for free (spec P1–P5). Facts and constraints:
- Instagram can auto-publish Reels to our own Professional account (Standard Access, resumable upload). TikTok Direct Post is private-only without an audit; inbox upload may work unaudited (spike). YouTube API uploads from an unverified project are locked private. LinkedIn stays manual.
- The product owner's merge of a post record is the approval (P3). Records, videos and alerts live in the private repo `vbenedito/careeros-ops` (P3–P5), next to the ledger (ADR-0013).
- `vbenedito/careeros` is public. Tokens can publish to our accounts, so they must never be in it.
- GitHub Free: about 2,000 Actions minutes a month for private repos, **no branch protection on private repos**, scheduled runs can start late under load.
- Platform tokens expire: Instagram long-lived token after 60 days (refreshable), TikTok access token after 24 hours (refresh token about a year). A refresh can return a new token, which must be saved.
- `/admin` is read-only and adds no table or paid service (ADM-04, ADM-16).

Four decisions: **where the code runs and lives**, **how the approval is enforced**, **how a post is published at most once**, and **how rotating tokens are stored**.

## Options — where the code lives and runs
1. **Code in the public repo, workflows and secrets in `careeros-ops`, code checked out at a pinned SHA.** Code is reviewed and tested like the rest (CI, spec-trace, review depth). The secrets never reach the public repo's CI. Cost: a SHA bump PR in the ops repo for each code change.
2. **Everything in `careeros-ops`.** Simplest secret story, but the code has no CI, no tests in the main suite and no review process; a second codebase to keep.
3. **Workflows in the public repo with environment secrets.** Public repo Actions minutes are free, but secrets in a public repo's workflows are exposed to every change of `main` and to mistakes in `pull_request_target`; records and videos would still need to come from the private repo.
4. **A hosted scheduler (Vercel cron, Supabase cron, a paid tool).** Vercel Hobby cron is limited and would put platform tokens in the web app's environment; paid tools are ruled out (free only).

## Options — enforcing "merge is approval"
1. **Branch protection or rulesets on `main`.** Not available for private repos on GitHub Free.
2. **Scheduler check through the API**: publish only if the record's last commit belongs to a merged PR, and (optional) merged by a given login. Free, works today; it cannot tell two actors apart if both use the same GitHub login.
3. **GitHub environments with required reviewers.** Not available for private repos on GitHub Free.

## Options — at most once
1. **State commit before the irreversible step**: write `queued` plus the platform's container or publish id, push, then publish; a rerun asks the platform about that id. Uses only git and the platform API.
2. **Status in the record file itself.** Mixes human-approved content with machine state and makes the approval check (did the content change after the merge?) hard.
3. **No state, check the platform for a matching caption.** Fragile and not supported by every API.

## Options — storing rotating tokens
1. **Repository secrets, rewritten by a fine-grained token with Secrets: read and write on `careeros-ops` only** (`gh secret set`). Standard; the writing token cannot read secret values.
2. **Tokens encrypted with `age` in the repo, key in a secret** (as the backups do). No secret-writing token, but encrypted tokens stay in git history and a leak of key plus repo exposes them.
3. **Product owner renews tokens by hand** every ~50 days and for every new TikTok refresh token. Breaks "minimum human interaction" and the TikTok refresh token can rotate on any refresh.

## Decision
- Code: **option 1**. `scripts/posts/` and `packages/shared/src/posts.ts` in the public repo; workflows, records, state, release assets, issues and secrets in `careeros-ops`. Ops workflows check out the public repo at a **pinned 40-character SHA** and pin third-party actions by SHA (PST-01..03).
- Approval: **option 2** plus a process rule: no agent merges, approves or pushes a record to `main` (PST-08, PST-10). If Claude sessions get their own GitHub identity, set `POSTS_APPROVER_LOGIN` to turn the rule into a hard check (spec Q1).
- At most once: **option 1**, with the state in a separate file per post (`posts-state/`), a `concurrency` group on the scheduler, and a publish window after which a slot is `skipped`, never posted late (PST-07, PST-11..13).
- Tokens: **option 1**, least scopes (PST-21), the secret-writing token used only in the refresh step, expiry dates (never values) in `posts-state/tokens.json`, expiry-warning issues (PST-22, PST-23).
- Scheduler: cron every 15 minutes **only on post days inside the 90-minute window**, plus one daily job, to stay far under the free minutes (PST-28).
- Alerts and reminders: GitHub issues in `careeros-ops`, one per stem, platform and kind (PST-24, PST-25).

**Why the code is public on purpose.** The code holds no data, no account ids and no tokens; it is only API calls that the platforms document publicly. Public code gets the normal CI, tests and reviews, which matter more for a job that posts in our name than hiding it would. The supply-chain risk (a bad commit to the public repo reaching a job that holds tokens) is limited because the ops repo runs **only a SHA the product owner merged in an ops PR**, never `main`; a change to the public repo does nothing to the pipeline until that bump.

## Consequences
+ No token, record or video in the public repo; `/admin` keeps reading files with its read-only token (ADR-0013), no new table.
+ The pipeline code is tested and reviewed like the product; secret-holding workflows get an Opus deep review (agents.md §2).
+ A rerun or a late cron run cannot post twice or post late.
+ Free: GitHub Actions minutes (estimate about 310 a month), release assets and issues.
− Two steps for each code change (public PR, then SHA bump PR in the ops repo).
− The approval is a check plus a rule, not a platform guarantee, while Claude and the product owner may share one login (spec Q1).
− `OPS_SECRETS_TOKEN` can overwrite every secret of `careeros-ops`. Accepted: one repo, cannot read values, expiry warned 14 days ahead.
− Scheduled runs can start late; a run more than 90 minutes late skips the post (accepted: a skip is better than a late post). The 14-of-16 target leaves room for two.
− TikTok and YouTube still need a person until the TikTok spike and the YouTube audit (P1, P2).
