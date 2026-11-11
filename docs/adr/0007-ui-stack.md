# ADR-0007 — React + Tailwind in both apps; shadcn/ui + Recharts in the dashboard

Status: Accepted · Date: 2026-11-04

## Context
The UI brief asks for a shadcn/ui-inspired dashboard (collapsible sidebar, cards, bar + pie charts) and a minimal popup that feels like the same product, both with light/dark themes.

## Options (popup)
1. Vanilla TS + CSS — smallest bundle; separate styling approach from the dashboard; more manual DOM code for live updates.
2. **React + Tailwind** — same mental model and design tokens as the dashboard; ~45 KB gzip extra, irrelevant for a local popup.
3. Preact — smaller React; another compatibility surface.

## Options (dashboard)
- **shadcn/ui** (components copied into the repo, built on Radix) — owns the code, no opaque runtime dependency, provides `Sidebar`, `Card`, `Sheet`, `Tooltip`, `Chart` (Recharts wrapper) matching the brief directly.
- A full component library (MUI, Mantine) — heavier and a different look.

## Decision
Popup: React + Tailwind, sharing the theme CSS variables with the dashboard (copied tokens, not a shared component package — only a few primitives are needed). Dashboard: Next.js + Tailwind + shadcn/ui + its Chart component (Recharts) + `next-themes`. No other UI dependencies without justification.

## Consequences
+ Consistent look, fast delivery of sidebar/charts, light/dark built in.
− Recharts adds ~100 KB to the dashboard page; acceptable for v0; loaded only on the dashboard route.

## Amendment (2026-11-07, #20)
Tokens are **shared, not copied**: one CSS file, `packages/shared/theme/tokens.css`, imported by the popup and the dashboard, so the two cannot drift. Primitives stay per app (a handful in the popup, shadcn/ui in the dashboard). Conventions in `docs/design-system.md`.

## Update 2026-11-11 (#131)
As built, the dashboard charts use Recharts directly (`components/dashboard/activity-chart.tsx`, `platform-chart.tsx`); the shadcn/ui `Chart` component was not added.
