# Documentation

Last reviewed: 2026-11-11

## The rule

| Folder | Answers | Changes when |
|---|---|---|
| [`specs/`](../specs/README.md) | **What** the product must do: requirements with stable IDs (`TRK-05`) | Behavior or scope changes; amended with a dated note, approved by the product owner |
| [`docs/architecture/`](architecture/overview.md) | **How** it is built: components, flows, modules, data | The code changes; updated in the same PR |
| [`docs/adr/`](adr/README.md) | **Why** a design was chosen over alternatives | A decision is made; accepted ADRs get dated updates, not rewrites |
| [`docs/history/`](history/README.md) | What was planned, found or delivered at a point in time | Never: frozen, only links are fixed |

Architecture docs link to spec IDs instead of repeating the rules. If a doc and the code disagree, the code on `main` is the truth and the doc is fixed.

**Living** docs are kept current with the code. **Snapshots** record a moment and are not updated.

## Index

| Doc | Type | Owner | Status | Last reviewed |
|---|---|---|---|---|
| [Glossary](glossary.md) | living | tech lead | Current | 2026-11-11 |
| **Architecture** | | | | |
| [Overview (HLD)](architecture/overview.md) | living | tech lead | Current | 2026-11-11 |
| [Extension (LLD)](architecture/extension.md) | living | tech lead | Current | 2026-11-11 |
| [Web app (LLD)](architecture/web.md) | living | tech lead | Current | 2026-11-11 |
| [Database (LLD)](architecture/database.md) | living | tech lead | Current | 2026-11-11 |
| [Design system](design-system.md) | living | tech lead | Current | 2026-11-11 |
| [ADRs](adr/README.md) (0001–0014, [template](adr/template.md)) | living | tech lead | 0001–0011, 0013, 0014 accepted; 0012 proposed (#176) | 2026-11-22 |
| [ADR-0011: ingest v2](adr/0011-ingest-v2.md) | living | tech lead | Proposed (#176) | 2026-11-17 |
| [ADR-0012: entitlements](adr/0012-entitlements.md) | living | tech lead | Proposed (#176) | 2026-11-17 |
| [ADR-0014: posts pipeline](adr/0014-posts-pipeline.md) | living | tech lead | Accepted (#264) | 2026-11-22 |
| **Product** | | | | |
| [Specifications](../specs/README.md) | living | product owner | v0, LAND, STORE approved; v1 proposed | 2026-11-17 |
| [v1 discovery](../specs/v1/00-discovery.md) | snapshot | product owner | Approved 2026-11-17 | 2026-11-17 |
| [v1 spec: LeetCode problems (`PRB`)](../specs/v1/01-problems.md) | living | product owner | Proposed (#176) | 2026-11-17 |
| [v1 spec: entitlements (`ENT`)](../specs/v1/02-entitlements.md) | living | product owner | Proposed (#176) | 2026-11-17 |
| [v1 spec: posts pipeline (`PST`)](../specs/v1/04-posts-pipeline.md) | living | product owner | Accepted (#264) | 2026-11-22 |
| [Roadmap](roadmap.md) | living | product owner | Candidates, none authorized | 2026-11-11 |
| [Landing content](landing/content.md) | living | product owner | Implemented; LAND-03 binds | 2026-11-11 |
| [Landing SEO plan](landing/seo.md) | living | product owner | Implemented; LAND-04..07 bind | 2026-11-11 |
| [Chrome Web Store listing](chrome-web-store/listing.md) | living | product owner | Submission in progress | 2026-11-11 |
| [Marketing: brand profile](marketing/brand-profile.md) | living | product owner | Draft; open points for the product owner | 2026-11-17 |
| [Marketing: audience persona](marketing/persona.md) | living | product owner | Draft; assumptions to validate | 2026-11-17 |
| [Marketing: brand voice](marketing/voice.md) | living | product owner | Draft; test after first 10 posts | 2026-11-17 |
| [Marketing: platform study](marketing/platform-study.md) | living | product owner | Draft; start set YouTube Shorts + TikTok, LinkedIn test slot; revisit after 8 weeks | 2026-11-17 |
| [Marketing: content pillars](marketing/content-pillars.md) | living | product owner | Draft; 4 pillars (40/30/20/10); revisit after 8 weeks | 2026-11-17 |
| [Marketing: video formats](marketing/video-formats.md) | living | product owner | Draft; 5 formats, visual kit, music, free workflow, 3 example scripts | 2026-11-17 |
| [Marketing: goals and KPIs](marketing/goals-and-kpis.md) | living | product owner | Draft; north star per platform, UTM scheme, decision rules, 8-week review | 2026-11-17 |
| [Marketing: launch kit, week 1](marketing/launch-kit.md) | living | product owner | Draft; videos 1–2 final, bios, bio links, week-0 checklist | 2026-11-20 |
| **Process and operations** | | | | |
| [Contributing](process/contributing.md) | living | tech lead | Current | 2026-11-11 |
| [Agents: model routing](process/agents.md) | living | tech lead | Current | 2026-11-12 |
| [Release](process/release.md) | living | tech lead | Current; some steps proposed | 2026-11-12 |
| [Operations](operations.md) | living | tech lead | Current | 2026-11-12 |
| [Agent rules (AGENTS.md)](../AGENTS.md) | living | tech lead | Current | 2026-11-11 |
| [Security policy (SECURITY.md)](../SECURITY.md) | living | product owner | Current | 2026-11-11 |
| **History** ([index](history/README.md)) | | | | |
| [v0 backlog](history/backlog/v0.md) | snapshot | product owner | Frozen | 2026-11-11 |
| [Spike 0003: auth handoff](history/spikes/0003-auth-handoff.md) | snapshot | tech lead | Frozen | 2026-11-11 |
| [Security review v0](history/security-review-v0.md) | snapshot | tech lead | Frozen | 2026-11-11 |
| [Security audit v0](history/security-audit-v0.md) | snapshot | tech lead | Frozen | 2026-11-11 |
| [Codebase review (grill) 2026-11-12](history/grill-report-2026-11-12.md) | snapshot | tech lead | Frozen | 2026-11-12 |
| [v0 test report](history/delivery/v0-test-report.md) | snapshot | tech lead | Frozen | 2026-11-11 |
| [v0 delivery report](history/delivery/v0-delivery-report.md) | snapshot | tech lead | Frozen | 2026-11-11 |
| [Landing references](history/landing/references.md) | snapshot | tech lead | Frozen | 2026-11-11 |
| [Landing architecture proposal](history/landing/architecture.md) | snapshot | tech lead | Frozen | 2026-11-11 |

## Adding a doc

Put it in the folder that matches the rule above, add a `Type · Owner · Last reviewed` line under the title, and add a row here.
