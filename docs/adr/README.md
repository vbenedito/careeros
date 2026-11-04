# Architecture Decision Records

Format: lightweight [MADR](https://adr.github.io/madr/) — Context · Options · Decision · Consequences. Status is one of *Proposed*, *Accepted*, *Superseded by ADR-NNNN*.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-monorepo-pnpm.md) | pnpm monorepo without build orchestrator | Accepted |
| [0002](0002-extension-storage.md) | `chrome.storage` instead of `localStorage` | Accepted |
| [0003](0003-extension-session-handoff.md) | Dashboard-initiated extension session via single-use token | Proposed (spike required) |
| [0004](0004-idempotent-ingest.md) | Idempotent interval ingest via client UUIDs and an RPC | Accepted |
| [0005](0005-media-activity.md) | Audible tab counts as activity, with a 15-min ceiling | Accepted |
| [0006](0006-tabs-permission.md) | `tabs` permission instead of per-site host permissions | Accepted |
| [0007](0007-ui-stack.md) | React + Tailwind in both apps; shadcn/ui + Recharts in the dashboard | Accepted |
| [0008](0008-docker-local-backend.md) | Docker-based local backend via Supabase CLI | Accepted |

Accepted at Gate 2 approval (2026-11-04); ADR-0003 is accepted after its spike (#10).
