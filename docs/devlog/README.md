# Devlog

One file per working day: `YYYY-MM-DD.md` (America/Sao_Paulo). Written by the `devlog` agent
skill (`.claude/skills/devlog/SKILL.md`) from the day's commits, PRs, issues and review
decisions, then reviewed by the owner in a PR. Days without activity have no file.

Each entry is history first. When the day had something worth sharing, it also carries a
LinkedIn-style post draft; whether it gets posted is the owner's call, tracked in `status`.

## Template

```markdown
---
date: 2026-11-05
issues: [13]
prs: [46]
post_worthy: true        # false when the day was routine
status: draft            # draft | posted | skip
---

# 2026-11-05 — <one-line headline>

## Summary
Two or three sentences: what moved forward today.

## Shipped
- Merged or completed work, with issue/PR numbers.

## Decisions
- Decision — why (link the PR comment, spec or ADR).

## Problems & fixes
- What broke or was found in review, and how it was fixed.

## Lessons
- What we would do the same or differently.

## Post draft
<LinkedIn-style draft, or "No post today: <reason>".>
```

After posting, change `status` to `posted` (optionally add `posted_url:`).
