# Spike 0004 — Posts pipeline platform APIs

Issue #266 · Spec [PST](../../../specs/v1/04-posts-pipeline.md) (phase a, Q2, Q3, Q8) · ADR-0014 · Date: 2026-11-24 · Result: **success on all three platforms; open: YouTube Studio check by the product owner, Instagram token lifetime and refresh (PST-c)**

## Question

Before the publishers are built (PST-14, PST-14a, PST-16): do the planned API paths work, for free, with our own accounts and unaudited or unverified apps?

## Method

Three manual workflows in the private ops repo (`spike-instagram.yml`, `spike-youtube.yml`, `spike-tiktok.yml`), each reviewed by Opus and approved by the product owner (PST-32). Each makes a synthetic 21 s 1080 x 1920 test video with ffmpeg on the runner. Secrets were created by the product owner in the ops repo; logs print status codes only (masked tokens, URLs and ids).

## Results

| Platform | Path tested | Result |
|---|---|---|
| Instagram | Reel container from `video_url` = GitHub's short-lived signed release-asset URL; status poll; **no `media_publish`** | `IN_PROGRESS` at 12 s, `FINISHED` at 22 s. Meta fetches the URL at once. No Facebook Page, no PPA (Page Publishing Authorization) step |
| YouTube | Refresh → resumable `videos.insert` from our unverified project, `privacyStatus=unlisted` | Kept `unlisted` (not locked private). `videos.list` with only `youtube.upload` → **403 insufficientPermissions** |
| TikTok | Sandbox app, unaudited: refresh → inbox upload (`FILE_UPLOAD`, one chunk) → status poll | PUT `201`, status `SEND_TO_USER_INBOX` in about 15 s. The draft shows in the **phone app** inbox (not on the website) |

## Findings that change the spec

1. **Instagram host.** The Meta app uses "API setup with Unified Login". Its tokens start with `EA` and work on `graph.facebook.com`, not `graph.instagram.com` (that returned OAuthException 190). The account id is shown in the Meta app; it is not a secret.
2. **YouTube read-back** needs `youtube.readonly` (read-only) next to `youtube.upload`.
3. **Tokens.** YouTube consent screen "In production" (no 7-day expiry; re-check a refresh after 7 days). TikTok: access 24 h, refresh about 365 days; this refresh returned the same refresh token, but the docs say it can rotate, so a rotated token is saved at once with the secrets-only PAT (`OPS_SECRETS_PAT`, fine-grained, ops repo only, 90 days).
4. **TikTok first sign-in.** The redirect URI `https://github.com/vbenedito/careeros-ops` works: the product owner copies the code from the address bar and exchanges it once on his own computer. No web route on our site.
5. **Release assets.** Claude sessions cannot create releases (HTTP 403 for this session type); a workflow can (`contents: write`), and so can the product owner in the GitHub web page.

## Incidents

- A screenshot of the OAuth Playground showed the YouTube client secret and part of a refresh token in chat. The product owner rotated the client secret, removed the old grant and made a new refresh token the same day. Rule kept: never screenshot pages that show secrets.

## Sources

The run results, the secret names, the phone-app TikTok inbox, the release-asset 403 and the open items come from the comments of issue #266 (tech lead, session 2026-11-22-a).
