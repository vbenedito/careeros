# 04 — Automated social posts pipeline

Status: **Proposed (2026-11-22, #263)** · Issue: #263 · Source: product-owner decisions P1–P5 (2026-11-22, below), marketing requirements (#263, comment 1) · Related ADRs: [0014](../../docs/adr/0014-posts-pipeline.md) (posts pipeline: code public, data and secrets private), [0013](../../docs/adr/0013-admin-access.md) (private ops repo, read-only token) · Related: #260 (post history on `/admin`), [video formats](../../docs/marketing/video-formats.md) §4, [goals and KPIs](../../docs/marketing/goals-and-kpis.md) §5–6, [launch kit](../../docs/marketing/launch-kit.md)

## 1. Objective

The product owner publishes the first post (Tue 2026-11-24) by hand. From the next post on, a pipeline takes an approved video and its texts to the platforms with **minimum human interaction**, at no cost. A person still approves every post: the product owner's **merge** of the post record is the approval. Nothing publishes without it.

The decisions below are numbered P1–P5 so they do not clash with the discovery decisions D1–D26 in [00-discovery](00-discovery.md).

### Product-owner decisions (2026-11-22)

| # | Decision |
|---|---|
| P1 | v1 scope. **Instagram Reels**: auto-publish through the Instagram API with Instagram Login (Professional Creator account, Standard Access for our own account, no app review, no Facebook Page; resumable upload, so no public video URL; no link stickers by API). **TikTok**: Upload API to the creator's **inbox** at the post time; the product owner finishes the post in the app. Direct Post from an unaudited client is private only, so it is not used. A spike first confirms that inbox upload works unaudited; if not, TikTok gets a reminder issue. **YouTube Shorts**: an API upload from an unverified project is locked private, so YouTube stays on the native Studio schedule with a reminder issue. **LinkedIn** (from week 3): reminder issue only |
| P2 | Apply for the free YouTube API compliance audit (own channel only) after the pipeline works. If it passes, YouTube auto-publish is a later step |
| P3 | **One post record file per post** in the private repo `vbenedito/careeros-ops`, validated by a schema in `packages/shared`. Claude opens it as a PR. The product owner's merge is the approval. The same files feed #260 |
| P4 | Video files are **release assets** in `careeros-ops` |
| P5 | Alerts and reminders are **GitHub issues** in `careeros-ops` (GitHub notifies by email and in the app) |
| — | Free only: no paid service. The tech lead (Claude) owns the design decisions and reports them |

### Stages

```
Approve -> Make -> Prepare -> Queue -> Publish -> Verify -> Record
 (PO)      (PO)    (Claude PR,  (checks    (pipeline,   (pipeline   (day 7:
                    PO merges)   on the PR) or PO tap)   or PO)      PO reads, Claude writes)
```

| Stage | Who | What |
|---|---|---|
| Approve | Product owner | Script and facts approved (video formats §4.6, items 1–9) |
| Make | Product owner | Edit in Kdenlive, music, AI-label decision, export (video formats §4.4–4.5); uploads the file to a release |
| Prepare | Claude, then product owner | Claude writes the post record and opens a PR; the product owner reads the preview and merges (PST-08) |
| Queue | Pipeline | Checks on the PR (PST-09) |
| Publish | Pipeline, or product owner | Instagram automatic; TikTok inbox, finished by a tap; YouTube and LinkedIn by reminder (PST-12..18) |
| Verify | Pipeline, or product owner | Post id or URL; YouTube Content ID check next day; TikTok music confirmation (PST-19) |
| Record | Product owner reads, Claude writes | Day-7 numbers with each app's own metric names (PST-27) |

## 2. Constants

| Name | Value | Notes |
|---|---|---|
| `OPS_REPO` | `vbenedito/careeros-ops` | Private. Same repo as the ledger (ADM-05) |
| `PUBLIC_REPO` | `vbenedito/careeros` | Holds the pipeline code |
| `POSTS_DIR` | `posts/` | Record: `posts/YYYY/YYYY-MM-DD-<slug>.json` |
| `POSTS_STATE_DIR` | `posts-state/` | Pipeline state: `posts-state/YYYY/YYYY-MM-DD-<slug>.json` (same stem) |
| `POSTS_SCHEMA_VERSION` | 1 | Field `schema` in every record and state file |
| `POST_TIMEZONE` | `America/Sao_Paulo` | The only timezone of a record |
| `POST_DAYS` | Tuesday, Thursday | Same local time on both days (launch kit §1) |
| `POST_TIME` | set once in the calendar, e.g. `19:00` | Ops repo variable, not a secret. The cron of PST-11 is written from it |
| `PUBLISH_WINDOW_MIN` | 90 | A platform not published within 90 minutes after its time is `skipped`, never posted late |
| `SCHEDULER_STEP_MIN` | 15 | Cron step inside the window |
| `MAX_ATTEMPTS` | 3 | Automatic attempts per platform inside the window |
| `VIDEO_MIN_S`, `VIDEO_MAX_S` | 20, 45 | Video formats §4.5 |
| `VIDEO_SIZE` | 1080 x 1920 (9:16) | Video formats §4.5 |
| `IG_TOKEN_WARN_DAYS` | 14 | Expiry-warning issue when the Instagram token has less left |
| `TIKTOK_TOKEN_WARN_DAYS` | 30 | Same for the TikTok refresh token |
| `OPS_PAT_WARN_DAYS` | 14 | Same for the secret-writing token (PST-22) |
| `METRICS_DAY` | 7 | Day after publish when numbers are read |
| `ACTIONS_MINUTES_BUDGET` | 2,000 per month | GitHub Free, private repos (to confirm on the billing page); target use under 25% (PST-28) |
| `PLATFORMS` | `instagram`, `tiktok`, `youtube`, `linkedin` | Also the `utm_source` values (goals and KPIs §6) |

## 3. Requirements

**Split of code and data (ADR-0014)**

- **PST-01** The pipeline **code** lives in `PUBLIC_REPO` under `scripts/posts/`: pure functions (validation, slot and window rules, UTM links, issue text, status transitions) and one small client per platform API. Unit tests cover the pure functions; the clients are tested against stubs (no network in CI, like `OPS_GITHUB_API_STUB`, ADM-08). The record and state schemas are in `packages/shared` (`posts.ts`), like the ledger schema (ADM-06).
- **PST-02** The **data and secrets** live in `OPS_REPO`: post records, state files, video release assets, the workflows that hold tokens (PST-11, PST-20..23) and the issues (PST-24). Nothing of it is ever in `PUBLIC_REPO`, a log, a chat or an issue body.
- **PST-03** Every ops workflow checks out `PUBLIC_REPO` at a **pinned full commit SHA** (40 characters), written in the workflow file, never a branch or tag. A bump of the SHA is a PR in `OPS_REPO` that names the public PR it takes in. Dependencies install with `pnpm install --frozen-lockfile` from that commit. Third-party actions in ops workflows are pinned by SHA too.

**Post record (Prepare)**

- **PST-04** One JSON **record** per post at `posts/YYYY/YYYY-MM-DD-<slug>.json`, schema version 1, strict (an unknown key fails), validated with `PostRecordSchema` from `packages/shared`:

  ```json
  {
    "schema": 1,
    "slug": "restart-after-gap",
    "date": "2026-11-26",
    "time": "19:00",
    "timezone": "America/Sao_Paulo",
    "pillar": "restart",
    "format": "steps",
    "video": {
      "release": "post-2026-11-26-restart-after-gap",
      "asset": "2026-11-26-restart-after-gap.mp4",
      "sha256": "<64 hex characters>"
    },
    "music_license": "<reference to the license record, video formats §3.3>",
    "ai_label": false,
    "platforms": {
      "instagram": { "status": "ready", "caption": "...", "hashtags": ["#..."], "link": null, "alt_text": "...", "text_version": "..." },
      "tiktok": { "status": "ready", "caption": "...", "hashtags": ["#..."], "link": null, "alt_text": null, "text_version": "..." },
      "youtube": { "status": "ready", "title": "...", "caption": "...", "hashtags": ["#..."], "link": null, "alt_text": null, "text_version": "..." },
      "linkedin": { "status": "draft", "caption": "...", "hashtags": [], "link": "https://careeros-taupe.vercel.app/?utm_source=linkedin&utm_medium=social&utm_campaign=restart-after-gap", "alt_text": "...", "text_version": "..." }
    }
  }
  ```

  `slug` is the topic slug of goals and KPIs §6 (2 to 4 lowercase words, letters and digits, hyphens, at most 30 characters) and equals `utm_campaign`. The file stem is `date` + `-` + `slug`, the same stem as the video (video formats §4.3). `pillar` and `format` use the names of the content pillars and video formats. `time` is `POST_TIME`, `timezone` is `POST_TIMEZONE`. A platform that is not used for this post is left out of `platforms`. `title` is required for YouTube only. Record `status` is set by people: `draft` (never published), `ready` (publish at the time) or `skipped` (not on this platform this time).
- **PST-05** `link` is `null` or exactly the link built by `buildUtmLink(platform, slug)` (goals and KPIs §6: landing page `/`, `utm_source` = platform, `utm_medium=social`, `utm_campaign` = slug, no other parameter). The link is generated, never typed. The rules of video formats §4.6 items 20–21 apply: YouTube has no link in the description.
- **PST-06** A record and a state file hold **no personal data, no account emails and no tokens**. Text fields hold only post text. ADM-07 applies.
- **PST-07** Pipeline **state** is a separate file per post at `posts-state/YYYY/<stem>.json`, written only by the pipeline (and by Claude for day-7 numbers, PST-27), validated with `PostStateSchema`. Per platform: `status` (`queued` | `published` | `failed` | `skipped`), `attempts`, `platform_id` (container id, publish id or media id), `url`, `published_at` (ISO 8601 with offset), `issue` (number of the open reminder or alert issue), `error` (HTTP status and the API's error code only), `metrics` (PST-27). The record file never changes after the merge because of the pipeline, so the approval check (PST-10) stays simple. The **effective status** of a platform is the state status when there is one, else the record status; #260 shows the effective status.
- **PST-08** Claude writes the record (captions per app, hashtags, links, alt text, text version) from the approved script and opens it as a PR in `OPS_REPO`. The PR body lists, per platform, the mode (automatic, inbox, reminder) and the time in `POST_TIMEZONE` and in UTC. **The product owner's merge is the approval.** No agent merges, approves or pushes a record to `main` (rule added to `docs/process/agents.md` in phase b).

**Queue (checks on the PR)**

- **PST-09** A check workflow runs on every PR in `OPS_REPO` that touches `posts/` (no platform tokens; `GITHUB_TOKEN` with read access only) and fails on any of: schema error (PST-04); stem does not match `date` and `slug`; slug already used by another record (one slug per idea, never reused); a `ready` platform with an empty required field; a link that differs from `buildUtmLink` (PST-05); the release asset is missing or its SHA-256 differs from `video.sha256`; the video is not 1080 x 1920 or not 20 to 45 s (read with `ffprobe`); the date is not a `POST_DAYS` day or the time is not `POST_TIME`; the time is already in the past. It writes one PR comment, updated on each run: the checks and, per platform, mode and time ("Instagram: automatic, Tue 2026-12-01 19:00 São Paulo (22:00 UTC)"). A red check means the PR must not be merged.
- **PST-10** **Approval check at publish time.** Before any upload, the scheduler confirms through the GitHub API that the record's current content on `main` came in through a **merged PR** (the last commit that touched the file belongs to a merged PR) and, when `POSTS_APPROVER_LOGIN` is set (ops variable), that this PR was merged by that login. A record pushed straight to `main`, or changed after the merge without a new merged PR, is not published: the platform becomes `failed` with an alert (PST-25). See open question Q1.

**Publish**

- **PST-11** **Scheduler.** A GitHub Actions workflow in `OPS_REPO` runs on a cron every `SCHEDULER_STEP_MIN` minutes, **only on `POST_DAYS` and only inside the window** from `POST_TIME` to `POST_TIME` + `PUBLISH_WINDOW_MIN` (cron in UTC, minutes off the full hour, e.g. `7,22,37,52`), plus `workflow_dispatch`. It has `concurrency: posts-publish` with `cancel-in-progress: false`, so two runs never overlap. Each run picks the platforms whose effective status is `ready` or `queued`, whose mode is automatic or inbox, and whose time has passed.
- **PST-12** **Window, no catch-up.** A platform whose time is more than `PUBLISH_WINDOW_MIN` ago and is not published is set to `skipped` with an alert, never published late. A new time needs a new merged PR (a new record time). The daily job (PST-23) does the same for any slot the scheduler missed (for example a GitHub outage).
- **PST-13** **Idempotent, at most once.** Before the step that makes a post public, the scheduler commits `queued` with the platform id (Instagram container id, TikTok publish id) to the state file and pushes. A later run that finds `queued` **asks the platform** for that id's status and finishes from there; it never starts a second upload for a platform that has an id. If the push of `queued` fails, the run stops without publishing. A rerun of any run never posts twice.
- **PST-14** **Instagram (automatic).** For a `ready` platform: download the release asset, check its SHA-256 (PST-09), create a Reels container (`media_type=REELS`, `upload_type=resumable`, caption with hashtags, `share_to_feed=true`), commit `queued` (PST-13), upload the bytes to `rupload.facebook.com`, poll the container until `FINISHED`, publish (`media_publish`), read the permalink, set `published`, `platform_id`, `url`, `published_at`. A container whose status is already `PUBLISHED` is not published again. API version pinned in code. Alt text is sent if the API accepts it for Reels, otherwise it stays in the reminder of PST-17 (to confirm in phase c).
- **PST-15** **AI label guard.** When `ai_label` is `true` and a platform's API has no field for the platform's own AI label, the pipeline does **not** auto-publish there: that platform falls back to a reminder issue (PST-17) with the label step written first. The AI-label decision stays human.
- **PST-16** **TikTok (inbox).** Only after the spike (phase a) passes. At the post time: refresh the access token (PST-21), init the upload (`/v2/post/publish/inbox/video/init/`, `source=FILE_UPLOAD`, scope `video.upload`), commit `queued` with the publish id (PST-13), upload the chunks, open an issue "Finish the TikTok post now" with the caption and hashtags ready to copy (PST-24). The status endpoint is polled by later runs and the daily job: a public post id makes the platform `published`; otherwise the product owner pastes the URL in the issue and Claude records it. If the spike fails, TikTok uses PST-17 instead.
- **PST-17** **Reminders (YouTube, LinkedIn, and fallbacks).** When a record is merged, a workflow opens one reminder issue per platform in reminder mode: what to schedule, where (YouTube Studio, LinkedIn Page, TikTok scheduler), the time in `POST_TIMEZONE`, the texts ready to copy (title, caption, hashtags, link, alt text, text version) and the link to the release asset. The issue is closed by PST-19 when the post is verified.
- **PST-18** **Retry for one platform.** A failed attempt is retried by the next run inside the window, up to `MAX_ATTEMPTS`; only the failed platform is retried, never the others. After the last attempt the platform is `failed`. The product owner can ask for one more try inside the window by adding the label `retry` to the alert issue; outside the window that is refused in a comment (PST-12).

**Verify**

- **PST-19** **Verification.** Instagram: the media id and permalink from the API. TikTok: the status endpoint or the URL pasted in the issue. YouTube: the channel's public RSS feed (no token), matched by title, read by the daily job after the time; when found, `published` with URL and the reminder closes. LinkedIn: the product owner pastes the URL in the issue. The day after a YouTube post, the daily job opens a short issue "Check Content ID claims in Studio for <slug>"; for TikTok the issue of PST-16 includes "answer the music usage confirmation". A verified platform's issue is closed automatically with the URL in a comment.

**Secrets and tokens**

- **PST-20** Tokens are **repository secrets in `OPS_REPO`**, set by the product owner in the GitHub settings, never in chat, logs, issues, records or `PUBLIC_REPO`. Secrets are read only by the jobs that need them (job-level `env`, not workflow-level); the PR check (PST-09) gets none. Workflow `permissions:` are set per job to the minimum (`contents: write` and `issues: write` only where the job writes). Code never prints a token, a request header or a full API URL with a query string; errors carry the HTTP status and the API error code only.
- **PST-21** **Least privilege.** Instagram: `instagram_business_basic` and `instagram_business_content_publish` only. TikTok: `video.upload` only. A scope beyond these is a spec change (see PST-27 option).
- **PST-22** **Refresh.** A refresh job (part of PST-23):
  1. *Instagram*: the long-lived token (60 days) is refreshed every 7 days with `refresh_access_token`; the new token is written back to the secret.
  2. *TikTok*: the 24-hour access token is never stored; each run gets one from the refresh token. When TikTok returns a new refresh token, it is written back to the secret in the same run, before any upload.
  3. Writing a secret uses a fine-grained token `OPS_SECRETS_TOKEN` with **Secrets: read and write on `OPS_REPO` only** and nothing else, used only by the refresh step.
  4. The state of the tokens (expiry dates only, no values) is kept in `posts-state/tokens.json`.
- **PST-23** **Daily job** (once a day, outside the publish window): refresh tokens (PST-22); open an expiry-warning issue when a token has less than its warn days left (`IG_TOKEN_WARN_DAYS`, `TIKTOK_TOKEN_WARN_DAYS`, `OPS_PAT_WARN_DAYS`; the PAT expiry is read from the API response header); verify (PST-19); skip missed slots (PST-12); open day-7 issues (PST-27). A failed refresh opens an alert at once, with the steps to make a new token by hand.

**Issues and alerts**

- **PST-24** Every reminder, alert and warning is a **GitHub issue in `OPS_REPO`**, with a label (`post-reminder`, `post-alert`, `token-expiry`, `post-metrics`) and the stem in the title, so GitHub notifies the product owner by email and in the app. The body holds only post text, times, the asset link and the next step; never a token or an API response body. One open issue per stem, platform and kind: a rerun updates it, it never opens a second one.
- **PST-25** **A failed upload opens an alert within 15 minutes**: the run that fails opens (or updates) the alert issue in the same run, with the platform, the HTTP status and error code, the attempt count, what happens next (next attempt or `failed`) and how to retry (PST-18). A failure of the workflow itself (a crash before the alert step) is caught by a final step that runs `if: failure()` and opens the alert.

**Record**

- **PST-26** **Admin read.** `/admin` only reads records and state files (ADM-04), with the existing read-only token and cache (ADM-08, ADM-16). No new table, no paid service, no write from `/admin`. The card is built in #260 against the schemas of PST-04 and PST-07.
- **PST-27** **Day-7 numbers.** On day `METRICS_DAY` the daily job opens one `post-metrics` issue per post listing, per platform, the numbers to read and their names in each app (goals and KPIs §5). The product owner writes the numbers in a comment; Claude copies them into `metrics` of the state file by a commit, with the app's own metric names and the date read. Numbers are never estimated or invented; a missing number is `null`. *Option (not in v1 unless the product owner says yes):* read Instagram Reels insights by API. It needs the extra scope `instagram_business_manage_insights` (PST-21), free, same token.

**Limits**

- **PST-28** **Free only.** No paid service or plan. GitHub Actions minutes in `OPS_REPO` stay under 25% of `ACTIONS_MINUTES_BUDGET` (estimate: about 105 scheduler runs, 30 daily runs and 20 PR and merge runs a month, at about 2 minutes each, about 310 minutes). Release assets stay under GitHub's per-file limit (a 45 s export at 10 Mbit/s is about 60 MB).

**Process**

- **PST-29** The ops repo has a `README.md` (written in phase b) with: layout, how to add a release asset, the secrets list (names only), how to make each token by hand, the issue labels, and how to pause the pipeline (disable the scheduler workflow). The product owner's steps are written for a phone where possible.
- **PST-30** **Pause and manual override.** Disabling the scheduler workflow stops every automatic publish. Setting a platform to `skipped` in a merged record stops that one platform. Publishing by hand in the app is always allowed; the product owner then pastes the URL in the issue so the record stays complete.
- **PST-31** **Every post has a record.** A post published outside the pipeline (like the first post of 2026-11-24) gets a record and a state file afterwards (status `published`, URL), so #260 and the 8-week review see every post.

## 4. Success measures

From the marketing requirements (#263). Checked in the 8-week review (goals and KPIs §9), not by tests.

| Measure | Target |
|---|---|
| Product owner time per week | At most 85 to 90 minutes (budget 120) |
| Posts live | At least 14 of 16 |
| Failed upload | Alert within 15 minutes, retry for that platform only (PST-18, PST-25) |
| Late or double posts | None (PST-12, PST-13) |
| Records | Every post has one (PST-31) |

## 5. Stays human

Script and fact approval, the edit and phone check, music choice, the AI-label decision, caption approval (by merge), the tap that finishes a TikTok post, YouTube and LinkedIn scheduling (until P2), comments, Content ID disputes, KPI thresholds, and setting or renewing tokens.

## 6. Out of scope

Paid schedulers or services; TikTok Direct Post (private only without an audit); YouTube API upload (locked private until the audit, P2); Instagram link stickers and Stories; LinkedIn API posting; replying to comments; publishing or scheduling from `/admin`; reading platform metrics by API (except the PST-27 option); any database table for posts; posting to accounts other than CareerOS's own.

## 7. Acceptance criteria

1. Fixtures of valid and invalid records: the schema accepts the valid one and rejects each listed fault of PST-09 with a clear message (unit tests in `packages/shared` and `scripts/posts/`).
2. `buildUtmLink` gives exactly the goals and KPIs §6 link for each platform; a typed link that differs fails the check.
3. Slot rules: a time inside the window is due, a time more than `PUBLISH_WINDOW_MIN` ago becomes `skipped`, a future time is not due; correct across the UTC date line for `America/Sao_Paulo`.
4. With the Instagram client stubbed: a full run publishes once; a rerun after a crash between `queued` and `media_publish` finishes the same container and does not publish twice; a run with a `PUBLISHED` container only records it.
5. A record whose last change was a direct push (no merged PR) is not published and opens an alert (PST-10).
6. A failed upload opens exactly one alert issue in the same run, and only that platform is retried (PST-18, PST-24, PST-25).
7. No token, header or query string appears in the output of any stubbed run (test on captured logs).
8. The TikTok spike result is written in `docs/history/spikes/` before PST-16 is built.
9. An ops-repo dry run (`workflow_dispatch` with `dry_run`) on a test record shows the plan and changes nothing.
10. `pnpm lint`, `typecheck`, `test`, `check:links` and `check:spec-trace` pass.

## 8. Open questions

| # | Question | Tech lead's default |
|---|---|---|
| Q1 | Which GitHub identity do Claude sessions use in `OPS_REPO`? If it is the product owner's own login, "merged by the product owner" cannot be told apart from "merged by Claude" (PST-10), and GitHub Free has no branch protection on private repos | **Answered 2026-11-22 (tech lead):** Claude sessions use the product owner's login (`gh api user` = the owner). So the rule in `agents.md` (PST-08) is the control; `POSTS_APPROVER_LOGIN` only if a separate identity is added later |
| Q2 | Does the TikTok inbox upload work for an unaudited client, and does the status endpoint return a public post id after the product owner finishes the post? | Phase a decides; fallback PST-17 |
| Q3 | TikTok OAuth needs a registered redirect URI for the first token. Can a local loopback URI be used, or is an HTTPS page on our domain needed? | Find out in phase a; no new web route without a spec change |
| Q4 | Does the Instagram API accept alt text and a custom cover for Reels? | Confirm in phase c; else the reminder carries them |
| Q5 | Do Shorts appear in the channel's public RSS feed (PST-19)? | Confirm in phase e; else the product owner pastes the URL |
| Q6 | Turn on the Instagram insights option of PST-27 (one more scope)? | No in v1; ask at the 8-week review |
| Q7 | `POST_TIME` value | The product owner picks it once (launch kit §1) |

## 9. Issues

| Issue | Work | Area | Model · review | Order |
|---|---|---|---|---|
| PST-a | Spike: TikTok inbox upload with an unaudited client, status values, OAuth redirect (Q2, Q3). Result in `docs/history/spikes/` | spike, private sandbox account | Sonnet · tech lead's check | First, in parallel with b |
| PST-b | Schemas `PostRecordSchema`, `PostStateSchema`, `buildUtmLink`, slot rules (PST-04..07, PST-12); ops repo layout, README, labels, the PR check workflow (PST-09, PST-29); `agents.md` rule (PST-08); backfill record of the first post (PST-31) | `packages/shared`, `scripts/posts/`, ops repo | Sonnet · Sonnet | After this spec is accepted |
| PST-c | Instagram publisher and scheduler: client, approval check, idempotent state, window, retry, alerts, daily job with token refresh and expiry warnings (PST-10..15, PST-18, PST-20..25, PST-28) | `scripts/posts/`, ops workflows | Sonnet · **Opus deep review** (secrets, scheduled workflow) | After b |
| PST-d | TikTok inbox upload (PST-16, TikTok part of PST-22), or the reminder fallback if the spike failed | `scripts/posts/`, ops workflows | Sonnet · **Opus deep review** (secrets) | After a and c |
| PST-e | Reminders for YouTube and LinkedIn, RSS verification, Content ID issue (PST-17, PST-19) | `scripts/posts/`, ops workflows | Sonnet · Sonnet | After c |
| PST-f | YouTube API compliance audit application, own channel only (P2) | product owner, Google forms | Main session · tech lead's check | After c and e have run for 2 weeks |
| PST-g | Record stage: day-7 issues and metrics (PST-27); #260 card reads records and state (PST-26) | `scripts/posts/`, `apps/web/app/admin` | Sonnet · Sonnet | After c; #260 after b |
