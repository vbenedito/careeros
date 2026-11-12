# Architecture Decision Records

Format: lightweight [MADR](https://adr.github.io/madr/) — Context · Options · Decision · Consequences. Status is one of *Proposed*, *Accepted*, *Superseded by ADR-NNNN*.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-monorepo-pnpm.md) | pnpm monorepo without build orchestrator | Accepted |
| [0002](0002-extension-storage.md) | `chrome.storage` instead of `localStorage` | Accepted |
| [0003](0003-extension-session-handoff.md) | Dashboard-initiated extension session via single-use token | Accepted |
| [0004](0004-idempotent-ingest.md) | Idempotent interval ingest via client UUIDs and an RPC | Accepted |
| [0005](0005-media-activity.md) | Audible tab counts as activity, with a 15-min ceiling | Accepted |
| [0006](0006-tabs-permission.md) | `tabs` permission instead of per-site host permissions | Accepted |
| [0007](0007-ui-stack.md) | React + Tailwind in both apps; shadcn/ui + Recharts in the dashboard | Accepted |
| [0008](0008-docker-local-backend.md) | Docker-based local backend via Supabase CLI | Accepted |
| [0009](0009-landing-route-and-rendering.md) | Landing page at `/`, pre-built static HTML with its own CSP | Accepted |
| [0010](0010-web-analytics.md) | Vercel Web Analytics on the website, cookieless, never in the extension | Proposed (accepted on approval of #137) |

Accepted at Gate 2 approval (2026-11-04); ADR-0003 accepted after spike #10 (2026-11-05); ADR-0009 accepted on 2026-11-10 (#99).

## Process

**When to write one.** A decision with real trade-offs that is hard to reverse or that later readers will question: a new dependency or framework, a storage or protocol choice, a permission, a security model, a change to how the system is deployed. Requirements themselves go in [`specs/`](../../specs/README.md); an ADR explains *why* the design meets them this way.

**Numbering.** The next free four-digit number, file `NNNN-short-title.md`, copied from [`template.md`](template.md). Numbers are never reused.

**Statuses.**

| Status | Meaning |
|---|---|
| Proposed | Written, under discussion; not yet a basis for code |
| Accepted | Approved; code may rely on it |
| Superseded by ADR-NNNN | Replaced by a later ADR; kept for history |

**Who approves.** The product owner, through the tech lead: the tech lead drafts and recommends, the product owner accepts (or delegates acceptance explicitly, as for ADR-0009). Add the ADR to the table above in the same PR.

**Update, don't rewrite.** Once accepted, the Context, Options and Decision stay as they were. New facts go in a dated section at the end (`## Update <YYYY-MM-DD> (#issue)`), as in ADR-0006. A different decision is a new ADR that supersedes the old one; the old one's status changes to *Superseded by ADR-NNNN*.
