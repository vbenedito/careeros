---
name: devlog
description: Write the CareerOS daily devlog entry (history + optional LinkedIn-style post draft) from the day's GitHub activity. Use when asked for "devlog", "day summary", "resumo do dia", or by the evening scheduled task.
---

# Daily devlog

Turns one day of work on CareerOS into `docs/devlog/YYYY-MM-DD.md`: an honest history entry,
plus a LinkedIn-style post draft **only when the day has something worth sharing**. The owner
decides whether to post. Format reference: `docs/devlog/README.md`.

## 1. Define the day

- Time zone: `America/Sao_Paulo`. "The day" is today 00:00–23:59 local unless a date is given.
- If `docs/devlog/<date>.md` already exists, update it instead of creating a new one.

## 2. Gather facts (GitHub is the source of truth)

Repository `vbenedito/careeros`. Collect, for the day only:

- Commits on all branches: `git fetch --all && git log --all --since=<start> --until=<end> --format='%h %s'`
- PRs opened, updated, merged: `gh api "search/issues?q=repo:vbenedito/careeros+is:pr+updated:<date>"`; for each, title, body summary, state.
- Issues opened or closed the same way (`is:issue`).
- Review and conversation comments on those PRs: these carry the owner's **decisions** and the reasons. Quote at most a short phrase.
- CI conclusions for the day's runs (`actions/runs?created=<date>`): note failures that were fixed and what fixed them.
- Spec, ADR and doc changes (`git diff --stat` on `specs/`, `docs/adr/`): decisions recorded that day.

Use only what the sources say. Never invent numbers, results or quotes.

## 3. Decide whether it is post-worthy

Post-worthy when at least one is true: a milestone or user-visible feature shipped; an
interesting technical problem was solved (security finding, race condition, a spike result);
a design decision with a clear trade-off was made; a lesson about working with AI agents
(specs, review gates, independent reviews) is concrete enough to teach something.

Not post-worthy: dependency bumps, renames, formatting, CI plumbing with no lesson. Then write
`post_worthy: false` and one sentence why. It is fine — and expected — that many days are not.

## 4. Write the entry

Follow the template in `docs/devlog/README.md` exactly (frontmatter + sections).

The post draft (when post-worthy):
- Written in first person as the owner, in English, ≤ 1,300 characters.
- A plain first line that states the point (no clickbait), then 3–5 short lines or bullets of
  what happened and why it matters, then one honest takeaway.
- Be clear about the split of work: the owner decides scope and approves; AI agents draft,
  implement and review under specs and gates. Never overstate what was done.
- At most 3 hashtags. Link the repository or PR only if it is public.

## 5. Safety

Never include secrets, tokens, keys, `.env` contents, email addresses, user IDs, internal URLs
of session logs, or anything from a file the owner keeps outside the repo.

## 6. Deliver

- Branch `devlog/<date>`, commit `docs(devlog): <date>`, open a PR titled the same with the
  post draft in the PR body so it can be read on the phone. Never merge it: merges need the
  owner's approval.
- If there was no activity at all that day, create nothing and stop.
