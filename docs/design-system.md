# Design system

Small and deliberate: one set of tokens, a handful of primitives, and a fixed way to compose
screens. Same rules in the popup and the dashboard.

## 1. Tokens — `packages/shared/theme/tokens.css`

The only place colors, radius and the font stack are defined. Names follow shadcn/ui, so the
dashboard's shadcn components use them as they are.

| Token | Use |
|---|---|
| `background` / `foreground` | Page surface and default text |
| `card` / `card-foreground` | Raised surfaces (the "Today" card, dashboard cards) |
| `muted` / `muted-foreground` | Secondary surfaces (bar tracks) and secondary text |
| `border`, `input`, `ring` | Dividers, field borders, focus outline |
| `primary` / `primary-foreground` | Main actions, links, bars |
| `destructive` | Irreversible actions (Disconnect, Delete account) |
| `success`, `warning` | Status only ("Tracking", "Not connected") |
| `chart-1` … `chart-6` | Categorical chart colours (donut slices; `chart-6` is "Other") |
| `radius` | `rounded-sm` / `md` / `lg` derive from it |

Light and dark values live side by side. The dashboard switches with a `.dark` / `.light` class
(next-themes); the popup follows the OS.

**Rule:** components use token utilities (`bg-card`, `text-muted-foreground`, `border-border`)
— never raw colors (`#fff`, `text-gray-500`, `oklch(...)`).

## 2. Primitives

| App | Where | What |
|---|---|---|
| Popup | `apps/extension/src/popup/ui/` | `Button` (primary · outline · ghost · subtle · link · link-xs · destructive; sm · md · icon), `Card`, `Meter`, `Switch`, `Input`, `cn` |
| Dashboard | `apps/web/components/ui/` | shadcn/ui-style components on Radix (`button`, `card`, `input`, `dialog`, `skeleton`, `tooltip`, `sheet`, `dropdown-menu`, `sidebar`), written into the repo, using the same tokens; app-level pieces (sidebar content, page header, theme toggle) in `components/app/`; one folder per page for its blocks (`components/dashboard/`, `components/settings/`) |

Interaction defaults live in `packages/shared/theme/interaction.css`, imported by both apps after the tokens: every clickable control (buttons, `role="button"`/`switch`/`menuitem…`/`tab`, `summary`) shows the **pointer** cursor and disabled ones show **not-allowed** (#94; Tailwind v4 no longer gives buttons the pointer). Links get the pointer from the browser.

A primitive owns its look (variants, sizes, focus, disabled state). Screens never restyle a
primitive beyond layout classes (margin, width, alignment).

## 3. Composition

```
App shell (data, clock, routing)
  └─ views/       one per screen: layout only (`MainView`, `SettingsView`)
       └─ components/  one per block of the spec (StatusSection, TodayCard, TopSites, SyncFooter)
            └─ ui/        primitives (Button, Card, Meter, …)
```

- **Logic stays out of components.** Values come from pure, unit-tested functions
  (`lib/popup-view.ts`; dashboard data transforms in #22). Components only render.
- **Data access goes through one adapter** per app (`popup/data.ts`), so components are tested
  with fixtures.

## 4. Conventions

- **Type:** `text-xs` (captions, footer) · `text-sm` (body) · `text-base` (titles) · `text-4xl` (the
  one headline number). `tabular-nums` for every duration.
- **Spacing:** multiples of the Tailwind scale; sections in a view use `gap-3`, items inside a
  block `gap-1.5`/`gap-2`.
- **Durations:** always `formatDuration` from `@careeros/shared` (EXT-UI-02).
- **Accessibility (EXT-UI-09):** real `<button>`s with text (icon-only buttons need
  `aria-label`); status is text, never color alone; bars are decorative next to a text value;
  `:focus-visible` outline from `ring`; contrast ≥ WCAG AA in both themes.
- **Copy:** short, sentence case, no exclamation marks; errors say what to do next.
