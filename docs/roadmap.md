# Roadmap — candidate future iterations

> **Nothing on this page is authorized for implementation.** Each item becomes work only when the product owner requests it and approves its spec and issues (Gate 5). Order and content may change.

| Candidate | Idea | Architectural notes for later |
|---|---|---|
| v1 | Exercise identification on one platform (e.g. LeetCode) | Requires content scripts or URL-pattern rules per platform → privacy review, host permissions (ADR-0006 revisit). A platform-adapter boundary in the extension. |
| v2 | Exercise results/attempts history | New tables; likely per-platform parsing; data retention policy. |
| v3 | Study patterns & richer analytics (time of day, consistency) | Aggregation views/materialization; still RLS-scoped. |
| v4 | Spaced repetition | Scheduling model, notifications. |
| v5 | AI-generated insights & recommendations | Server-side LLM calls, cost controls, explicit consent, prompt-injection boundaries. |
| Distribution | Chrome Web Store listing | Optional host permissions, store privacy disclosures, review process. |
| UX | Custom date range; onboarding presets for common study sites | Deferred from v0 (DASH §7). |
| Auth UX | "One login": connect the extension automatically on dashboard sign-in, and sign it out together with the dashboard in the same browser | Discussed 2026-11-05; v0 keeps separate sign-ins (AUTH-04). Fits the current design: sessions stay separate, only the `CONNECT`/`DISCONNECT` messages are triggered automatically. |

Also deferred: goals, streaks/gamification, paid plans, mobile apps, Notion integration.
