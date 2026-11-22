# ADR-0014 — Posts pipeline: public code, private data and secrets, GitHub Actions scheduler

Status: Proposed · Date: 2026-11-22 · Issue: #263 · Spec: [PST](../../specs/v1/04-posts-pipeline.md)

Revised 2026-11-22 after the Opus deep review of PR #264 (tech-lead decisions T1–T9 in the spec, under the product owner's delegation): YouTube auto-publish, Instagram `video_url`, the trust boundary of the ops repo, and stricter install, approval and concurrency rules.

## Context
After the first post (2026-11-24, by hand), social posts must go out with minimum human interaction, for free (spec P1–P5). Facts and constraints:
- **Instagram** can auto-publish Reels to our own Professional account (Standard Access). With Instagram Login the video must be at a URL Meta can fetch at the time of the attempt; resumable upload needs Facebook Login for Business.
- **YouTube**: since 2026-11-02, videos uploaded from unverified API projects are no longer restricted to private (YouTube Data API revision history). The default quota allows 100 `videos.insert` calls a day. Refresh tokens of OAuth apps in "Testing" status expire after 7 days.
- **TikTok** Direct Post is private-only without an audit; inbox upload may work unaudited (spike). Upload URLs live 1 hour; at most 5 pending shares in 24 hours. **LinkedIn** stays manual.
- The product owner's merge of a post record is the approval (P3). Records, videos and alerts live in the private repo `vbenedito/careeros-ops` (P3–P5), next to the ledger (ADR-0013).
- `vbenedito/careeros` is public. Tokens can publish to our accounts, so they must never be in it.
- GitHub Free, private repo: about 2,000 Actions minutes a month; **no branch protection, no rulesets and no environment secrets**; any workflow on any branch can read the repository secrets; scheduled runs can start late under load.
- Platform tokens expire or rotate (Instagram 60 days, refreshable; TikTok access 24 hours, refresh token can be replaced on refresh; YouTube access 1 hour). A new token must be saved.
- `/admin` is read-only and adds no table or paid service (ADM-04, ADM-16).

Five decisions: **where the code lives and runs**, **how the approval is enforced**, **how a post is published at most once**, **how rotating tokens are stored**, and **how far we trust the ops repo**.

## Options — where the code lives and runs
1. **Code in the public repo; workflows and secrets in `careeros-ops`; code checked out at a pinned SHA.** Code is reviewed and tested like the rest (CI, spec-trace, review depth). Secrets never reach the public repo's CI. Cost: a SHA bump PR in the ops repo for each code change.
2. **Everything in `careeros-ops`.** Simplest secret story, but the code has no CI, no tests in the main suite and no review process; a second codebase to keep.
3. **Workflows in the public repo with secrets.** Free minutes, but secrets in a public repo's workflows are exposed to every change of `main` and to `pull_request_target` mistakes; records and videos would still come from the private repo.
4. **A hosted scheduler (Vercel cron, Supabase cron, a paid tool).** Vercel Hobby cron is limited and would put platform tokens in the web app's environment; paid tools are ruled out.

## Options — enforcing "merge is approval"
1. **Branch protection, rulesets or environments with required reviewers.** Not available for private repos on GitHub Free.
2. **Scheduler check through the API**: squash merges only; the record's last commit must be the `merge_commit_sha` of a PR with `merged_at` set (the endpoint also lists open PRs), optionally merged by a given login; then the full validation runs again. Free, works today; it cannot tell two actors apart if both use the same GitHub login.

## Options — at most once
1. **State commit before the irreversible step**: write `queued` plus the platform's id, push, then publish; a rerun, or a retry after a timeout, asks the platform about that id first. Uses only git and the platform API.
2. **Status in the record file itself.** Mixes human-approved content with machine state and makes the approval check hard.
3. **No state; look for a matching caption on the platform.** Fragile and not supported by every API.

## Options — storing rotating tokens
1. **Repository secrets, rewritten by a fine-grained token with Secrets: read and write on `careeros-ops` only** (`gh secret set`, value on stdin). Standard; the writing token cannot read secret values.
2. **Tokens encrypted with `age` in the repo, key in a secret** (as the backups do). No secret-writing token, but encrypted tokens stay in git history.
3. **Product owner renews tokens by hand.** Breaks "minimum human interaction", and the TikTok refresh token can rotate on any refresh.

## Options — Instagram video source
1. **`video_url` = GitHub's short-lived signed download URL for the private release asset**, masked as a secret. No new service, no public copy of the video. Works only if Meta fetches it before it expires (spike).
2. **Facebook Login for Business with a linked Facebook Page**, resumable upload from the runner. Reliable, but needs a Page and a different login.
3. **A public copy of the video** (public release or bucket). Leaks unpublished videos; rejected.

## Decision
- Code: **option 1**. `scripts/posts/` and `packages/shared/src/posts.ts` in the public repo; workflows, records, state, release assets, issues and secrets in `careeros-ops`. Ops workflows check out the public repo at a **pinned 40-character SHA**, check that it is **reachable from public `main`** (a fork commit can be fetched by SHA), install with `--frozen-lockfile --ignore-scripts` filtered to the posts package, and pin third-party actions by SHA (PST-01..03).
- Approval: **option 2** plus a process rule: no agent merges, approves or pushes a record to `main` (PST-08, PST-10). If Claude sessions get their own GitHub identity, `POSTS_APPROVER_LOGIN` turns the rule into a hard check (spec Q1).
- At most once: **option 1**, with the state in a separate file per post (`posts-state/`), one concurrency group `posts-publish` for the scheduler, the daily job and the merge workflow, a rebase-once rule on a rejected push, and a publish window after which a slot is `skipped`, never posted late (PST-07, PST-11..13). GitHub keeps at most one pending run per concurrency group and cancels the older pending one, so a queued merge or daily run can be dropped silently: every run in the group therefore reconciles (opens missing reminders, does missed daily steps, idempotently) and alerts on any run of the group that ended `cancelled`. The YouTube upload-session URI is a bearer link and is never stored in git; a run that dies mid-upload never re-uploads by itself: the platform is set to `failed` with an alert, and only the product owner's `retry` label uploads again, so a slow uploads list cannot cause a second public video.
- Tokens: **option 1**, least scopes (PST-21), the secret-writing token used only in the refresh step, every runtime token and signed URL masked, expiry dates (never values) in `posts-state/tokens.json`, expiry-warning issues, and an alert at once if a rotated secret cannot be saved (PST-20, PST-22, PST-23).
- Instagram: **option 1**, fallback option 2, then reminder mode (T2, PST-14).
- YouTube: **auto-publish** with `videos.insert` (`youtube.upload` only, public, no `publishAt`), consent screen "In production" (T1, PST-14a). The audit is dropped.
- Scheduler: cron every 15 minutes **only on post days inside the 90-minute window** (weekday shifted when the window crosses midnight UTC), plus one daily job that also checks the cron still covers the next slot (PST-11, PST-23, PST-28).
- Alerts and reminders: GitHub issues in `careeros-ops` (PST-24, PST-25).

**Why the code is public on purpose.** The code holds no data, no account ids and no tokens; it only calls APIs that the platforms document publicly. Public code gets the normal CI, tests and reviews, which matter more for a job that posts in our name than hiding it would. The supply-chain risk (a bad commit to the public repo reaching a job that holds tokens) is limited because the ops repo runs **only a SHA that is on public `main` and that an ops PR pinned**, never `main` itself, with install scripts off.

**Trust boundary (accepted risk, T3).** On GitHub Free a private repo has no environment secrets and no branch protection, and a workflow on **any branch** can read every repository secret. So **anyone who can push to `careeros-ops` can read all its secrets**, including the Claude sessions that push ledger files. We accept this because the repo has only two writers (the product owner and Claude sessions he starts), and we add:
- a rule in `docs/process/agents.md`: agents never create or edit `.github/` in `careeros-ops` except in a PR named as a pipeline workflow change (`ops-workflow:`), reviewed by Opus and merged only after the product owner's "approved" (PST-32);
- a daily check that opens an `ops-security` alert when a workflow file on `main` changed outside a merged PR, or when any other branch carries changes under `.github/workflows/` (PST-33).
These detect a breach; they do not prevent one. A paid plan with environment secrets would prevent it and is out of scope (free only).

## Consequences
+ No token, record or video in the public repo; `/admin` keeps reading files with its read-only token (ADR-0013), no new table.
+ Instagram and YouTube publish with no tap; TikTok needs one tap; LinkedIn stays manual.
+ The pipeline code is tested and reviewed like the product; secret-holding workflows get an Opus deep review (agents.md §2).
+ A rerun, a timeout or a late cron run cannot post twice or post late.
+ Free: GitHub Actions minutes (estimate about 310 a month), release assets, issues, YouTube default quota.
− Two steps for each code change (public PR, then SHA bump PR in the ops repo).
− The approval is a check plus a rule, not a platform guarantee, while Claude and the product owner may share one login (spec Q1).
− Anyone with push access to `careeros-ops` can read its secrets; the trust checks only detect misuse after the fact.
− `OPS_SECRETS_TOKEN` can overwrite every secret of `careeros-ops`. Accepted: one repo, cannot read values, expiry warned 14 days ahead.
− The signed URL is a bearer link to an unpublished video for a short time; it is masked and never written to an issue or log.
− A queued run of the group can be dropped by GitHub; reconciliation and the cancelled-run alert make this a delay, not a lost step.
− Scheduled runs can start late; a run more than 90 minutes late skips the post (accepted: a skip is better than a late post). The 14-of-16 target leaves room for two.
− Three spikes (TikTok inbox, Instagram signed URL, YouTube public upload and token life) must pass before their publishers are built; each has a fallback.
