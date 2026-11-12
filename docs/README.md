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
| [ADRs](adr/README.md) (0001–0010, [template](adr/template.md)) | living | tech lead | 0001–0009 accepted; 0010 proposed (#137) | 2026-11-11 |
| **Product** | | | | |
| [Specifications](../specs/README.md) | living | product owner | v0, LAND, STORE approved | 2026-11-11 |
| [Roadmap](roadmap.md) | living | product owner | Candidates, none authorized | 2026-11-11 |
| [Landing content](landing/content.md) | living | product owner | Implemented; LAND-03 binds | 2026-11-11 |
| [Landing SEO plan](landing/seo.md) | living | product owner | Implemented; LAND-04..07 bind | 2026-11-11 |
| [Chrome Web Store listing](chrome-web-store/listing.md) | living | product owner | Submission in progress | 2026-11-11 |
| **Process and operations** | | | | |
| [Contributing](process/contributing.md) | living | tech lead | Current | 2026-11-11 |
| [Release](process/release.md) | living | tech lead | Current; some steps proposed | 2026-11-12 |
| [Operations](operations.md) | living | tech lead | Current | 2026-11-12 |
| [Agent rules (AGENTS.md)](../AGENTS.md) | living | tech lead | Current | 2026-11-11 |
| [Security policy (SECURITY.md)](../SECURITY.md) | living | product owner | Current | 2026-11-11 |
| **History** ([index](history/README.md)) | | | | |
| [v0 backlog](history/backlog/v0.md) | snapshot | product owner | Frozen | 2026-11-11 |
| [Spike 0003: auth handoff](history/spikes/0003-auth-handoff.md) | snapshot | tech lead | Frozen | 2026-11-11 |
| [Security review v0](history/security-review-v0.md) | snapshot | tech lead | Frozen | 2026-11-11 |
| [Security audit v0](history/security-audit-v0.md) | snapshot | tech lead | Frozen | 2026-11-11 |
| [v0 test report](history/delivery/v0-test-report.md) | snapshot | tech lead | Frozen | 2026-11-11 |
| [v0 delivery report](history/delivery/v0-delivery-report.md) | snapshot | tech lead | Frozen | 2026-11-11 |
| [Landing references](history/landing/references.md) | snapshot | tech lead | Frozen | 2026-11-11 |
| [Landing architecture proposal](history/landing/architecture.md) | snapshot | tech lead | Frozen | 2026-11-11 |

## Adding a doc

Put it in the folder that matches the rule above, add a `Type · Owner · Last reviewed` line under the title, and add a row here.
