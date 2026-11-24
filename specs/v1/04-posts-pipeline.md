# 04 — Automated social posts pipeline

Status: **Accepted (2026-11-22, product owner, #264)** · Issue: #263 · Source: product-owner decisions P1–P5 and tech-lead decisions T1–T9 (2026-11-22, below), marketing requirements (#263, comment 1) · Related ADRs: [0014](../../docs/adr/0014-posts-pipeline.md) (posts pipeline: code public, data and secrets private), [0013](../../docs/adr/0013-admin-access.md) (private ops repo, read-only token) · Related: #260 (post history on `/admin`), [video formats](../../docs/marketing/video-formats.md) §4, [goals and KPIs](../../docs/marketing/goals-and-kpis.md) §5–6, [launch kit](../../docs/marketing/launch-kit.md)

Amended 2026-11-22 (Opus deep review of PR #264; tech-lead decisions T1–T9, under the product owner's delegation of design decisions): YouTube Shorts are auto-published and the audit phase is dropped (T1); Instagram uses `video_url` with a signed download URL (T2); trust boundary of the ops repo (T3, PST-32, PST-33); install and SHA rules (PST-03); one concurrency group (PST-11); stricter approval check (PST-10); unknown outcomes and secret masking (PST-13, PST-20); cron and DST checks (PST-11, PST-23); TikTok limits (PST-16). Review round 2: every run in the concurrency group reconciles and cancelled runs alert (PST-11); the YouTube upload-session URI is never stored (PST-14a); `status.containsSyntheticMedia` named (PST-15); open `ops-workflow:` PR branches skipped (PST-33). Review round 3: no automatic YouTube re-upload after a dead run, only `failed` + alert + `retry` (PST-14a); one low-priority notice per open `ops-workflow:` PR (PST-33). New: PST-14a, PST-32, PST-33.

Amended 2026-11-24 (#266, spikes passed, [spike 0004](../../docs/history/spikes/0004-posts-pipeline-apis.md); tech lead): Instagram runs on `graph.facebook.com` with the Unified Login token and the account id in `IG_USER_ID` (PST-14, PST-21); YouTube adds `youtube.readonly` for the read-back (PST-21); the product owner uploads each video as a release asset before he merges the record (T10, PST-29); Q2, Q3 and Q8 answered.

Amended 2026-11-22 (#267, tech lead): fields required for a `ready` platform and hashtag format (PST-04); any YouTube link fails (PST-05, PST-09); video names follow the stem (PST-09); the window end is inclusive (PST-12); shapes of `error` and `metrics` (PST-07). Q7 stays open (default `19:00`).

## 1. Objective

The product owner publishes the first post (Tue 2026-11-24) by hand. From the next post on, a pipeline takes an approved video and its texts to the platforms with **minimum human interaction**, at no cost. A person still approves every post: the product owner's **merge** of the post record is the approval. Nothing publishes without it.

The decisions below are numbered P (product owner) and T (tech lead) so they do not clash with the discovery decisions D1–D26 in [00-discovery](00-discovery.md).

### Product-owner decisions (2026-11-22)

| # | Decision |
|---|---|
| P1 | v1 scope. **Instagram Reels**: auto-publish through the Instagram API with Instagram Login *(2026-11-24: the app uses Unified Login on graph.facebook.com, spike 0004)* (Professional Creator account, Standard Access for our own account, no app review, no Facebook Page; no link stickers by API). **TikTok**: Upload API to the creator's **inbox** at the post time; the product owner finishes the post in the app. Direct Post from an unaudited client is private only, so it is not used. A spike first confirms that inbox upload works unaudited; if not, TikTok gets a reminder issue. **YouTube Shorts**: native Studio schedule with a reminder issue *(changed by T1: auto-publish)*. **LinkedIn** (from week 3): reminder issue only |
| P2 | Apply for the free YouTube API compliance audit after the pipeline works *(dropped by T1: no longer needed)* |
| P3 | **One post record file per post** in the private repo `vbenedito/careeros-ops`, validated by a schema in `packages/shared`. Claude opens it as a PR. The product owner's merge is the approval. The same files feed #260 |
| P4 | Video files are **release assets** in `careeros-ops` |
| P5 | Alerts and reminders are **GitHub issues** in `careeros-ops` (GitHub notifies by email and in the app) |
| — | Free only: no paid service. The tech lead (Claude) owns the design decisions and reports them |

### Tech-lead decisions (2026-11-22, after the Opus deep review of PR #264)

| # | Decision |
|---|---|
| T1 | **YouTube Shorts are auto-published in v1.** Since 2026-11-02 the YouTube Data API says videos uploaded from unverified API projects are **not restricted to private** ([revision history](https://developers.google.com/youtube/v3/revision_history), [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)). `videos.insert`, scope `youtube.upload` only, `privacyStatus: public`, no `publishAt` (the scheduler publishes at the slot). The default quota allows 100 inserts a day, far above our need. The audit (P2) is dropped. The OAuth consent screen is in **"In production"** status, because refresh tokens of apps in "Testing" expire after 7 days (to verify in the spike). The unverified-app warning screen is accepted: the product owner is the only user |
| T2 | **Instagram uses `video_url`.** With Instagram Login *(2026-11-24: the app uses Unified Login on graph.facebook.com, spike 0004)*, resumable upload is not available; the video must be hosted where Meta can fetch it at the time of the attempt ([content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/)). Primary: `video_url` = the short-lived signed download URL that GitHub returns (by redirect) for the private release asset, treated as a secret. Fallback 1: Facebook Login for Business with a Facebook Page linked to the account (resumable upload). Fallback 2: reminder mode. The spike passed (2026-11-24, spike 0004). |
| T3 | **Trust boundary.** Anyone who can push to `careeros-ops` can read all its secrets (a workflow on any branch reads repository secrets; GitHub Free has no environment secrets in private repos). Accepted, with the rule and checks of PST-32 and PST-33 (ADR-0014) |
| T4 | Install with `--frozen-lockfile --ignore-scripts`, filtered to the posts package; the pinned SHA must be reachable from public `main` (PST-03) |
| T5 | One concurrency group for every ops workflow that writes state or secrets (PST-11) |
| T6 | Squash merges only in `careeros-ops`; stricter approval check and full re-validation before publishing (PST-10) |
| T7 | A timeout is an unknown outcome: ask the platform before any retry (PST-13); mask every runtime secret (PST-20) |
| T8 | Instagram `alt_text` is not supported for Reels: alt text stays in the issue text (Q4 closed) |
| T9 | Cron weekday shift across midnight UTC and a daily cron-coverage check (PST-11, PST-23) |
| T10 | **Release assets** (2026-11-24, spike 0004): Claude sessions cannot create releases. The product owner uploads the exported video to the release named in the record (GitHub web, drag and drop) before merging the record; the PR check (PST-09) fails until it is there |

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
| Queue | Pipeline | Checks on the PR (PST-09), repeated before publishing (PST-10) |
| Publish | Pipeline, or product owner | Instagram and YouTube automatic; TikTok inbox, finished by a tap; LinkedIn by reminder (PST-14..18) |
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
| `POST_TIME` | set once in the calendar, e.g. `19:00` | Ops repo variable, not a secret. The cron of PST-11 is made from it |
| `PUBLISH_WINDOW_MIN` | 90 | A platform not published within 90 minutes after its time is `skipped`, never posted late |
| `SCHEDULER_STEP_MIN` | 15 | Cron step inside the window |
| `MAX_ATTEMPTS` | 3 | Automatic attempts per platform inside the window |
| `VIDEO_MIN_S`, `VIDEO_MAX_S` | 20, 45 | Video formats §4.5 |
| `VIDEO_SIZE` | 1080 x 1920 (9:16) | Video formats §4.5 |
| `IG_TOKEN_WARN_DAYS` | 14 | Expiry-warning issue when the Instagram token has less left (refresh path checked in PST-c; until then a manual warning) |
| `TIKTOK_TOKEN_WARN_DAYS` | 30 | Same for the TikTok refresh token |
| `OPS_PAT_WARN_DAYS` | 14 | Same for the secret-writing token `OPS_SECRETS_PAT` (PST-22) |
| `IG_USER_ID` | the Instagram account id | Ops repo variable, not a secret (PST-14, PST-29) |
| `YT_INSERT_PER_DAY` | 100 | Default quota for `videos.insert`; we use at most 1 a day |
| `TIKTOK_UPLOAD_URL_TTL_MIN` | 60 | The TikTok upload URL is valid for 1 hour |
| `TIKTOK_PENDING_MAX_24H` | 5 | At most 5 pending shares in 24 hours |
| `METRICS_DAY` | 7 | Day after publish when numbers are read |
| `ACTIONS_MINUTES_BUDGET` | 2,000 per month | GitHub Free, private repos (to confirm on the billing page); target use under 25% (PST-28) |
| `PLATFORMS` | `instagram`, `tiktok`, `youtube`, `linkedin` | Also the `utm_source` values (goals and KPIs §6) |

## 3. Requirements

**Split of code and data (ADR-0014)**

- **PST-01** The pipeline **code** lives in `PUBLIC_REPO` under `scripts/posts/` (its own workspace package): pure functions (validation, slot and window rules, cron lines, UTM links, issue text, status transitions) and one small client per platform API. Unit tests cover the pure functions; the clients are tested against stubs (no network in CI, like `OPS_GITHUB_API_STUB`, ADM-08). The record and state schemas are in `packages/shared` (`posts.ts`), like the ledger schema (ADM-06).
- **PST-02** The **data and secrets** live in `OPS_REPO`: post records, state files, video release assets, the workflows that hold tokens (PST-11, PST-20..23) and the issues (PST-24). Nothing of it is ever in `PUBLIC_REPO`, a log, a chat or an issue body.
- **PST-03** Every ops workflow checks out `PUBLIC_REPO` at a **pinned full commit SHA** (40 characters), written in the workflow file, never a branch or tag. Before using it, the job checks that the SHA is **reachable from `main` of `PUBLIC_REPO`** (a commit of a fork can also be fetched by SHA); if not, it stops and alerts. Dependencies install with `pnpm install --frozen-lockfile --ignore-scripts`, filtered to the posts package and its workspace dependencies. A bump of the SHA is a PR in `OPS_REPO` that names the public PR it takes in. Third-party actions in ops workflows are pinned by SHA too.

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

  `slug` is the topic slug of goals and KPIs §6 (2 to 4 lowercase words, letters and digits, hyphens, at most 30 characters) and equals `utm_campaign`. The file stem is `date` + `-` + `slug`, the same stem as the video (video formats §4.3). `pillar` and `format` use the names of the content pillars and video formats. `time` is `POST_TIME`, `timezone` is `POST_TIMEZONE`. A platform that is not used for this post is left out of `platforms`. `title` is required for YouTube only; for YouTube, `caption` is the description. For a `ready` platform, `caption` and `text_version` are not empty, and for YouTube `title` is not empty; every hashtag matches `^#\S+$`. `video.release` is `post-<stem>` and `video.asset` is `<stem>.mp4`. Record `status` is set by people: `draft` (never published), `ready` (publish at the time) or `skipped` (not on this platform this time).
- **PST-05** `link` is `null` or exactly the link built by `buildUtmLink(platform, slug)` (goals and KPIs §6: landing page `/`, `utm_source` = platform, `utm_medium=social`, `utm_campaign` = slug, no other parameter). The link is generated, never typed. The rules of video formats §4.6 items 20–21 apply: YouTube has no link in the description: any non-null YouTube `link` fails the check (PST-09).
- **PST-06** A record and a state file hold **no personal data, no account emails and no tokens**. Text fields hold only post text. ADM-07 applies.
- **PST-07** Pipeline **state** is a separate file per post at `posts-state/YYYY/<stem>.json`, written only by the pipeline (and by Claude for day-7 numbers, PST-27), validated with `PostStateSchema`. Per platform: `status` (`queued` | `published` | `failed` | `skipped`), `attempts`, `platform_id` (container id, publish id or video id), `url`, `published_at` (ISO 8601 with offset), `issue` (number of the open reminder or alert issue), `error` (`{http_status, code}`, the HTTP status and the API's error code only, or `null`), `metrics` (PST-27; `{read_on, values}` where `values` maps each app's own metric name to a number or `null`, or `null` when not read). The record file never changes after the merge because of the pipeline, so the approval check (PST-10) stays simple. The **effective status** of a platform is the state status when there is one, else the record status; #260 shows the effective status.
- **PST-08** Claude writes the record (captions per app, hashtags, links, alt text, text version) from the approved script and opens it as a PR in `OPS_REPO`. The PR body lists, per platform, the mode (automatic, inbox, reminder) and the time in `POST_TIMEZONE` and in UTC. **The product owner's merge is the approval.** No agent merges, approves or pushes a record to `main` (rule added to `docs/process/agents.md` in phase b).

**Queue (checks on the PR)**

- **PST-09** A check workflow runs on every PR in `OPS_REPO` that touches `posts/` (no platform tokens; `GITHUB_TOKEN` with read access only) and fails on any of: schema error (PST-04); stem does not match `date` and `slug`; slug already used by another record (one slug per idea, never reused); a `ready` platform with an empty required field; a link that differs from `buildUtmLink` (PST-05); the release asset is missing or its SHA-256 differs from `video.sha256`; the video is not 1080 x 1920 or not 20 to 45 s (read with `ffprobe`); the date is not a `POST_DAYS` day or the time is not `POST_TIME`; the time is already in the past. It writes one PR comment, updated on each run: the checks and, per platform, mode and time ("Instagram: automatic, Tue 2026-12-01 19:00 São Paulo (22:00 UTC)"). A red check means the PR must not be merged.
- **PST-10** **Approval check at publish time.** `OPS_REPO` allows **squash merges only**. Before any upload, the scheduler confirms through the GitHub API that the record's last commit on `main` is the `merge_commit_sha` of a PR whose `merged_at` is set (the `commits/{sha}/pulls` endpoint also returns open PRs, so both fields are checked) and, when `POSTS_APPROVER_LOGIN` is set (ops variable), that this PR was merged by that login. It then **runs the full PST-09 validation again** (except "time in the past"), so a PR merged with a red check never publishes. A record pushed straight to `main`, changed after the merge without a new merged PR, or failing validation is not published: the platform becomes `failed` with an alert (PST-25). See open question Q1.

**Publish**

- **PST-11** **Scheduler.** A GitHub Actions workflow in `OPS_REPO` runs on a cron every `SCHEDULER_STEP_MIN` minutes, **only on `POST_DAYS` and only inside the window** from `POST_TIME` to `POST_TIME` + `PUBLISH_WINDOW_MIN` (cron in UTC, minutes off the full hour, e.g. `7,22,37,52`), plus `workflow_dispatch`. The cron lines are made by a tested pure function from `POST_TIME`, `POST_TIMEZONE` and `POST_DAYS`: when the window crosses midnight UTC (for `America/Sao_Paulo` at UTC−3, a `POST_TIME` of 21:00 or later), the part after midnight uses the next weekday. The scheduler, the daily job (PST-23) and the merge workflow (PST-17) share **one concurrency group `posts-publish`** with `cancel-in-progress: false`, so no two of them run at once and two TikTok refreshes never overlap. A state push that is rejected (someone pushed in between) is rebased once and pushed again; if that fails too, the run stops before any further publish step and alerts. Each run picks the platforms whose effective status is `ready` or `queued`, whose mode is automatic or inbox, and whose time has passed. GitHub keeps **at most one pending run per concurrency group**, and a newly queued run cancels the older pending one even with `cancel-in-progress: false`, so a merge or daily run can be dropped. Therefore **every run in the group reconciles** before its own work, idempotently: it opens any missing reminder issue (PST-17) and does any daily step that has not run today (PST-23). Each run also checks the last runs of the group's workflows and opens an alert when one ended as `cancelled` (once per run id).
- **PST-12** **Window, no catch-up.** The window end is inclusive: exactly `PUBLISH_WINDOW_MIN` minutes after the time is still inside. A platform whose time is more than `PUBLISH_WINDOW_MIN` ago and is not published is set to `skipped` with an alert, never published late. A new time needs a new merged PR (a new record time). The daily job (PST-23) does the same for any slot the scheduler missed (for example a GitHub outage).
- **PST-13** **Idempotent, at most once.** Before the step that makes a post public, the scheduler commits `queued` with the platform id (Instagram container id, TikTok publish id, YouTube video id; for YouTube before the id exists, only `queued` with no id) to the state file and pushes. A later run that finds `queued` **asks the platform** for that id's status and finishes from there; it never starts a second upload for a platform that has an id. A timeout or a lost answer on a publishing call is an **unknown outcome**, not a failure: before any retry the run asks the platform for the status of that id. If the push of `queued` fails, the run stops without publishing. A rerun of any run never posts twice.
- **PST-14** **Instagram (automatic, T2).** For a `ready` platform, on `graph.facebook.com` with the Unified Login token and the account id `IG_USER_ID` (an ops variable, not a secret; spike 0004): check the release asset's SHA-256 (PST-09); get the asset's signed download URL from the GitHub API (the redirect `Location`, short-lived) and mask it (PST-20); create a Reels container (`media_type=REELS`, `video_url` = that URL, caption with hashtags, `share_to_feed=true`); commit `queued` (PST-13); poll the container until `FINISHED`; publish (`media_publish`); read the permalink; set `published`, `platform_id`, `url`, `published_at`. A container whose status is already `PUBLISHED` is not published again. A container that fails because the URL expired is retried with a new URL inside the window. API version pinned in code. Alt text is not supported for Reels (T8): it stays in the issue text. The spike showed Meta fetches it at once; fallbacks stay for later failures (fallback 1: Facebook Login for Business with a linked Page, resumable upload; fallback 2: reminder, PST-17).
- **PST-14a** **YouTube Shorts (automatic, T1).** For a `ready` platform: get an access token (PST-22), check the SHA-256, upload with `videos.insert` (resumable upload; `snippet.title` = `title`; `snippet.description` = caption with hashtags and the text version; `status.privacyStatus` = `public`; `status.selfDeclaredMadeForKids` = `false`; no `publishAt`), commit `queued` before the upload starts and the video id when the upload returns (PST-13). The resumable upload-session URI works like a bearer link: it is masked (PST-20), kept only in the run's memory and never written to the state file, an issue or a log. If a run dies after the upload began but before a video id was stored (state `queued` with no id), the next run **never uploads again by itself**: it sets the platform to `failed` and opens an alert ("Check YouTube Studio for this video. If it is not there, add the label `retry`."); the `retry` label (PST-18) is the only way to upload again for that slot, so a slow uploads list or a missed title match cannot cause a second public video. After a successful upload, confirm with `videos.list` (`part=status`) on our own video id that it is public; set `published`, `url` (`https://www.youtube.com/shorts/<id>`), `published_at`. If the video comes back private or rejected, the platform is `failed` with an alert that holds the texts for Studio (PST-17).
- **PST-15** **AI label guard.** When `ai_label` is `true` and a platform's API has no field for the platform's own AI label, the pipeline does **not** auto-publish there: that platform falls back to a reminder issue (PST-17) with the label step written first. The AI-label decision stays human. (For YouTube the guard maps `ai_label` to `status.containsSyntheticMedia` in phase e; until phase e confirms that field, the guard applies to YouTube too.)
- **PST-16** **TikTok (inbox).** Only after the spike (phase a) passes. At the post time: get an access token (PST-22), init the upload (`/v2/post/publish/inbox/video/init/`, `source=FILE_UPLOAD`, scope `video.upload`), commit `queued` with the publish id (PST-13), upload the chunks **within `TIKTOK_UPLOAD_URL_TTL_MIN`** (the upload URL is valid for 1 hour), open an issue "Finish the TikTok post now" with the caption and hashtags ready to copy (PST-24). TikTok allows at most `TIKTOK_PENDING_MAX_24H` pending shares in 24 hours ([upload video reference](https://developers.tiktok.com/docs/en/content-posting-api-reference-upload-video)): the scheduler does not init an upload when the state shows that many unfinished inbox uploads in the last 24 hours, and alerts instead. The status endpoint is polled by later runs and the daily job: a public post id makes the platform `published`; otherwise the product owner pastes the URL in the issue and Claude records it. If the spike fails, TikTok uses PST-17 instead.
- **PST-17** **Reminders (LinkedIn and fallbacks).** When a record is merged, a workflow opens one reminder issue per platform in reminder mode (LinkedIn, and any platform that falls back): what to schedule, where (LinkedIn Page, TikTok scheduler, YouTube Studio, Instagram app), the time in `POST_TIMEZONE`, the texts ready to copy (title, caption, hashtags, link, alt text, text version) and the link to the release asset. The issue is closed by PST-19 when the post is verified.
- **PST-18** **Retry for one platform.** A failed attempt is retried by the next run inside the window, up to `MAX_ATTEMPTS`, after the status check of PST-13; only the failed platform is retried, never the others. After the last attempt the platform is `failed`. The product owner can ask for one more try inside the window by adding the label `retry` to the alert issue; outside the window that is refused in a comment (PST-12).

**Verify**

- **PST-19** **Verification.** Instagram: the media id and permalink from the API. YouTube: `videos.list` on our own video id (PST-14a). TikTok: the status endpoint or the URL pasted in the issue. LinkedIn: the product owner pastes the URL in the issue. The day after a YouTube post, the daily job opens a short issue "Check Content ID claims in Studio for <slug>" (a light step; the product owner closes it); for TikTok the issue of PST-16 includes "answer the music usage confirmation". A verified platform's issue is closed automatically with the URL in a comment.

**Secrets and tokens**

- **PST-20** Tokens are **repository secrets in `OPS_REPO`**, set by the product owner in the GitHub settings, never in chat, logs, issues, records or `PUBLIC_REPO`. Secrets are read only by the jobs that need them (job-level `env`, not workflow-level); the PR check (PST-09) gets none. Workflow `permissions:` are set per job to the minimum (`contents: write` and `issues: write` only where the job writes). Every value made at run time that grants access (access tokens from a refresh, rotated tokens, signed download URLs, upload-session URIs) is masked with `::add-mask::` before any other step uses it. Shell steps never use `set -x`. A secret is passed to `gh secret set` on stdin, never as an argument. Code never prints a token, a request header or a full API URL with a query string; errors carry the HTTP status and the API error code only.
- **PST-21** **Least privilege.** Instagram: the Unified Login token on `graph.facebook.com` with the publishing permissions the Meta app grants for content publishing only (spike 0004). TikTok: `video.upload` only. YouTube: `youtube.upload` and `youtube.readonly` (the read-back of PST-14a needs it, spike 0004). Any other scope is a spec change (see the PST-27 option).
- **PST-22** **Refresh.** A refresh step (in PST-23, and before each use):
  1. *Instagram*: the lifetime and refresh path of the Unified Login (`EA`) token are not checked yet. PST-c checks them before the refresh is built; until then no refresh method is assumed.
  2. *TikTok*: the 24-hour access token is never stored; each run gets one from the refresh token. Save-on-rotation stays: when TikTok returns a new refresh token, it is written back to the secret in the same run, before any upload. The concurrency group (PST-11) prevents two refreshes at once.
  3. *YouTube*: the access token is never stored; each run gets one from the refresh token. The OAuth consent screen is in "In production" status (T1), so the refresh token does not expire after 7 days. The spike token has only `youtube.upload`: the product owner makes one new refresh token with `youtube.upload` and `youtube.readonly` (once).
  4. Writing a secret uses a fine-grained token `OPS_SECRETS_PAT` with **Secrets: read and write on `OPS_REPO` only** and nothing else, used only by the refresh step. **A failed write of a rotated secret opens an alert at once** (the old token may already be invalid).
  5. The state of the tokens (expiry dates only, no values) is kept in `posts-state/tokens.json`.
- **PST-23** **Daily job** (once a day, outside the publish window): refresh tokens (PST-22; Instagram only after PST-c checks its refresh path); open an expiry-warning issue when a token has less than its warn days left (`IG_TOKEN_WARN_DAYS`, `TIKTOK_TOKEN_WARN_DAYS`, `OPS_PAT_WARN_DAYS`; the PAT expiry is read from the API response header); verify (PST-19); skip missed slots (PST-12); open day-7 issues (PST-27); check that the cron lines in the scheduler file cover the next slot, computed from `POST_TIME` and the current offset of `POST_TIMEZONE` (in case Brazil brings back daylight saving time), and alert if not; run the trust checks of PST-33. A failed refresh opens an alert at once, with the steps to make a new token by hand.

**Issues and alerts**

- **PST-24** Every reminder, alert and warning is a **GitHub issue in `OPS_REPO`**, with a label (`post-reminder`, `post-alert`, `token-expiry`, `post-metrics`, `ops-security`) and the stem in the title, so GitHub notifies the product owner by email and in the app. The body holds only post text, times, the asset link and the next step; never a token, a signed URL or an API response body. One open issue per stem, platform and kind: a rerun updates it, it never opens a second one.
- **PST-25** **A failed upload opens an alert within 15 minutes**: the run that fails opens (or updates) the alert issue in the same run, with the platform, the HTTP status and error code, the attempt count, what happens next (next attempt or `failed`) and how to retry (PST-18). A failure of the workflow itself (a crash before the alert step) is caught by a final step that runs `if: failure()` and opens the alert.

**Record**

- **PST-26** **Admin read.** `/admin` only reads records and state files (ADM-04), with the existing read-only token and cache (ADM-08, ADM-16). No new table, no paid service, no write from `/admin`. The card is built in #260 against the schemas of PST-04 and PST-07.
- **PST-27** **Day-7 numbers.** On day `METRICS_DAY` the daily job opens one `post-metrics` issue per post listing, per platform, the numbers to read and their names in each app (goals and KPIs §5). The product owner writes the numbers in a comment; Claude copies them into `metrics` of the state file by a commit, with the app's own metric names and the date read. Numbers are never estimated or invented; a missing number is `null`. *Option (not in v1 unless the product owner says yes):* read Instagram Reels insights by API. It needs the extra scope `instagram_business_manage_insights` (scope name to confirm for the Unified Login app) (PST-21), free, same token.

**Limits**

- **PST-28** **Free only.** No paid service or plan. GitHub Actions minutes in `OPS_REPO` stay under 25% of `ACTIONS_MINUTES_BUDGET` (estimate: about 105 scheduler runs, 30 daily runs and 20 PR and merge runs a month, at about 2 minutes each, about 310 minutes). YouTube stays far under `YT_INSERT_PER_DAY`. Release assets stay under GitHub's per-file limit (a 45 s export at 10 Mbit/s is about 60 MB).

**Process**

- **PST-29** The ops repo has a `README.md` (written in phase b) with: layout, how to add a release asset, the secrets list (names only, with `OPS_SECRETS_PAT`), the ops variables (`IG_USER_ID`), how to make each token by hand (including the YouTube consent screen in "In production" and the YouTube scopes `youtube.upload` and `youtube.readonly`), how the product owner uploads a release asset in the GitHub web page (Releases, new release, attach the file), the issue labels, and how to pause the pipeline (disable the scheduler workflow). The product owner's steps are written for a phone where possible.
- **PST-30** **Pause and manual override.** Disabling the scheduler workflow stops every automatic publish. Setting a platform to `skipped` in a merged record stops that one platform. Publishing by hand in the app is always allowed; the product owner then pastes the URL in the issue so the record stays complete.
- **PST-31** **Every post has a record.** A post published outside the pipeline (like the first post of 2026-11-24) gets a record and a state file afterwards (status `published`, URL), so #260 and the 8-week review see every post.

**Trust boundary (T3, ADR-0014)**

- **PST-32** **Workflow-change rule.** Agents never create or edit anything under `.github/` in `OPS_REPO`, except in a PR named as a pipeline workflow change (title starts with `ops-workflow:`), reviewed by Opus (agents.md §2) and merged only after the product owner's "approved". Rule added to `docs/process/agents.md` in phase b.
- **PST-33** **Workflow-change alerts.** The daily job opens an `ops-security` alert when (a) a file under `.github/workflows/` on `main` was changed by a commit that is not the `merge_commit_sha` of a merged PR, or (b) any branch other than `main` has a change under `.github/workflows/` compared with `main`, **except** the head branch of an open PR whose title starts with `ops-workflow:` (PST-32), which is expected while that PR is under review; when such a PR opens, the daily job still opens one low-priority `ops-security` notice naming the PR, so the title cannot hide a branch unseen. The alert names the file and the commit, never a secret value.

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

Script and fact approval, the edit and phone check, music choice, the AI-label decision, caption approval (by merge), the tap that finishes a TikTok post, LinkedIn scheduling, comments, Content ID checks and disputes, KPI thresholds, setting or renewing tokens, and the "approved" for workflow changes (PST-32).

## 6. Out of scope

Paid schedulers or services; TikTok Direct Post (private only without an audit); YouTube `publishAt` scheduling and the YouTube API audit (not needed after T1); Instagram link stickers and Stories; LinkedIn API posting; replying to comments; publishing or scheduling from `/admin`; reading platform metrics by API (except the PST-27 option); any database table for posts; posting to accounts other than CareerOS's own.

## 7. Acceptance criteria

1. Fixtures of valid and invalid records: the schema accepts the valid one and rejects each listed fault of PST-09 with a clear message (unit tests in `packages/shared` and `scripts/posts/`).
2. `buildUtmLink` gives exactly the goals and KPIs §6 link for each platform; a typed link that differs fails the check.
3. Slot rules: a time inside the window is due, a time more than `PUBLISH_WINDOW_MIN` ago becomes `skipped`, a future time is not due; correct across the UTC date line for `America/Sao_Paulo`.
4. Cron lines: for `POST_TIME` 19:00 they cover Tue and Thu 22:00 to 23:30 UTC; for 21:00 or later the part after midnight UTC falls on Wed and Fri; a changed timezone offset makes the coverage check of PST-23 fail.
5. With the Instagram and YouTube clients stubbed: a full run publishes once; a rerun after a crash or a timeout between `queued` and the publishing call asks for the status and does not publish twice; a run with a `PUBLISHED` container only records it.
6. A record whose last commit is not a merged PR's `merge_commit_sha`, a record from an open PR, or a merged record that fails validation is not published and opens an alert (PST-10).
7. A failed upload opens exactly one alert issue in the same run, and only that platform is retried (PST-18, PST-24, PST-25).
8. No token, signed URL, header or query string appears in the output of any stubbed run (test on captured logs), and every runtime secret is masked before use (PST-20).
9. The trust checks flag a direct push under `.github/workflows/` and a branch with workflow changes, and do not flag the head branch of an open `ops-workflow:` PR (PST-33), with fixtures of the GitHub API.
10. Dropped runs: with a fixture where the merge-reminder run and a daily run were cancelled, the next scheduler run opens the missing reminder issue, does the missed daily steps once, and opens one alert per cancelled run; a second run changes nothing (PST-11).
11. The spike results (TikTok inbox, Instagram `video_url` with a signed URL, YouTube public upload and refresh-token life) are written in `docs/history/spikes/` before PST-14, PST-14a and PST-16 are built.
12. YouTube recovery: with a fixture state `queued` without a video id, the next run uploads nothing, sets `failed` and opens one alert; only a `retry` label starts a new upload (PST-14a, PST-18).
13. An ops-repo dry run (`workflow_dispatch` with `dry_run`) on a test record shows the plan and changes nothing.
14. `pnpm lint`, `typecheck`, `test`, `check:links` and `check:spec-trace` pass.

## 8. Open questions

| # | Question | Tech lead's default |
|---|---|---|
| Q1 | Which GitHub identity do Claude sessions use in `OPS_REPO`? If it is the product owner's own login, "merged by the product owner" cannot be told apart from "merged by Claude" (PST-10), and GitHub Free has no branch protection on private repos | Use the rules in `agents.md` (PST-08, PST-32); set `POSTS_APPROVER_LOGIN` only if Claude uses a separate identity |
| Q2 | Does the TikTok inbox upload work for an unaudited client, and does the status endpoint return a public post id after the product owner finishes the post? | **Answered 2026-11-24:** yes, `SEND_TO_USER_INBOX` in about 15 s from the sandbox app; the draft shows in the phone app. The post id after finishing is checked in phase d |
| Q3 | TikTok OAuth needs a registered redirect URI for the first token. Can a local loopback URI be used, or is an HTTPS page on our domain needed? | **Answered 2026-11-24:** `https://github.com/vbenedito/careeros-ops` works; the product owner exchanges the code once on his own computer. No web route |
| Q4 | Closed (T8): Instagram alt text is not supported for Reels; it stays in the issue text | — |
| Q5 | Closed (T1): the RSS check is not needed; `videos.list` verifies | — |
| Q6 | Turn on the Instagram insights option of PST-27 (one more scope)? | No in v1; ask at the 8-week review |
| Q7 | `POST_TIME` value | The product owner picks it once (launch kit §1); until then `19:00` (the CLI takes `--post-time`) |
| Q8 | Does Meta fetch the GitHub signed URL before it expires (T2)? Does a public upload from our unverified project stay public, and do "Testing" refresh tokens expire after 7 days (T1)? Does `videos.list` on our own id work with `youtube.upload` alone (PST-21)? | **Answered 2026-11-24:** Meta fetched it at once (`FINISHED` at 22 s); the test used `unlisted`; public was not tested, but the privacy status was kept (not locked private); public is confirmed at the first real post; the consent screen is "In production"; `videos.list` needs `youtube.readonly` (403 with `youtube.upload` alone) |

## 9. Issues

| Issue | Work | Area | Model · review | Order |
|---|---|---|---|---|
| PST-a | Spikes, results in `docs/history/spikes/`: (1) TikTok inbox upload with an unaudited client, status values, OAuth redirect (Q2, Q3); (2) Instagram `video_url` with a GitHub signed URL (T2, Q8); (3) YouTube: a public upload from our unverified project stays public, consent screen "In production", refresh-token life, `videos.list` scope (T1, Q8) | spikes, test accounts | Sonnet · tech lead's check | First, in parallel with b |
| PST-b | Schemas `PostRecordSchema`, `PostStateSchema`, `buildUtmLink`, slot and cron rules (PST-04..07, PST-11, PST-12); ops repo layout, squash-only setting, README, labels, the PR check workflow (PST-09, PST-29); `agents.md` rules (PST-08, PST-32); backfill record of the first post (PST-31) | `packages/shared`, `scripts/posts/`, ops repo | Sonnet · Sonnet (the check workflow holds no secret) | After this spec is accepted |
| PST-c | Instagram publisher and scheduler: client, approval check, idempotent state, window, retry, alerts, daily job with token refresh, expiry warnings, cron and trust checks (PST-10..15, PST-18, PST-20..25, PST-28, PST-33) | `scripts/posts/`, ops workflows | Sonnet · **Opus deep review** (secrets, scheduled workflow) | After a(2) and b |
| PST-d | TikTok inbox upload (PST-16, TikTok part of PST-22), or the reminder fallback if the spike failed | `scripts/posts/`, ops workflows | Sonnet · **Opus deep review** (secrets) | After a(1) and c |
| PST-e | YouTube publisher (PST-14a, YouTube parts of PST-19 and PST-22, Content ID issue); LinkedIn reminders (PST-17) | `scripts/posts/`, ops workflows | Sonnet · **Opus deep review** (secrets) | After a(3) and c |
| PST-f | *Dropped (T1)*: the YouTube API audit is no longer needed | — | — | — |
| PST-g | Record stage: day-7 issues and metrics (PST-27); #260 card reads records and state (PST-26) | `scripts/posts/`, `apps/web/app/admin` | Sonnet · Sonnet | After c; #260 after b |
