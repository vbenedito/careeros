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
| `destructive` | Deleting or discarding data (Delete account, Remove a site, Disconnect and delete unsynced time) |
| `success`, `warning` | Status only ("Tracking", "Not connected") |
| `chart-1` … `chart-6` | Categorical chart colours (donut slices; `chart-6` is "Other"); ≥ 3:1 against `card`, never a status colour (below) |
| `radius` | `rounded-sm` / `md` / `lg` derive from it |

### Chart colour contrast (#76)

Chart slices are graphical objects, so each colour must reach **3:1** against the card it is
drawn on (WCAG 1.4.11) and stay apart from the status colours, so data never reads as status.
`packages/shared/src/theme-contrast.test.ts` computes both from `tokens.css` (OKLCH → sRGB
luminance; distance in OKLab, minimum 0.08 to `--success`, `--warning`, `--destructive`) and
fails on drift. Values as of 2026-11-12:

| Token | Light value | vs `--card` (light) | Dark value | vs `--card` (dark) |
|---|---|---|---|---|
| `chart-1` | `oklch(0.5 0.17 265)` | 5.70:1 | `oklch(0.72 0.14 265)` | 6.72:1 |
| `chart-2` | `oklch(0.6 0.15 185)` | 3.16:1 | `oklch(0.75 0.12 185)` | 8.01:1 |
| `chart-3` | `oklch(0.65 0.16 60)` | 3.10:1 | `oklch(0.68 0.13 55)` (was `0.8 0.14 75` = `--warning`) | 5.64:1 |
| `chart-4` | `oklch(0.58 0.18 330)` | 4.32:1 | `oklch(0.72 0.16 330)` | 6.33:1 |
| `chart-5` | `oklch(0.6 0.15 145)` | 3.40:1 | `oklch(0.85 0.16 125)` (was `0.75 0.14 145`, ≈ `--success`) | 11.08:1 |
| `chart-6` ("Other") | `oklch(0.6 0.01 265)` (was `0.75`: 2.04:1) | 3.62:1 | `oklch(0.56 0.01 265)` (was `0.5`: 2.82:1) | 3.63:1 |

Smallest OKLab distance to a status colour: light `chart-3`↔`warning` 0.100, `chart-5`↔`success`
0.082; dark `chart-2`↔`success` 0.086, `chart-3`↔`destructive` 0.089, `chart-3`↔`warning` 0.129.
The legend repeats every slice as text, so colour is never the only signal.

Light and dark values live side by side. The dashboard switches with a `.dark` / `.light` class
(next-themes); the popup follows the OS.

The landing page (`/`, LAND) is the exception: it is dark only and defines its own small palette
as CSS variables inside its inline stylesheet (`apps/web/lib/landing/page.ts`), not from
`tokens.css`; headings use self-hosted Mona Sans (#131).

**Rule:** components use token utilities (`bg-card`, `text-muted-foreground`, `border-border`)
— never raw colors (`#fff`, `text-gray-500`, `oklch(...)`).

## 2. Primitives

| App | Where | What |
|---|---|---|
| Popup | `apps/extension/src/popup/ui/` | `Button` (primary · outline · ghost · subtle · link · link-xs · destructive · destructive-ghost; sm · md · icon), `Card`, `Meter`, `Switch`, `Input`, `cn` |
| Dashboard | `apps/web/components/ui/` | shadcn/ui-style components on Radix (`button`, `card`, `input`, `dialog`, `skeleton`, `tooltip`, `sheet`, `dropdown-menu`, `sidebar`), written into the repo, using the same tokens; app-level pieces (sidebar content, page header, theme toggle) in `components/app/`; one folder per page for its blocks (`components/dashboard/`, `components/settings/`) |

Interaction defaults live in `packages/shared/theme/interaction.css`, imported by both apps after the tokens: every clickable control (buttons, `role="button"`/`switch`/`menuitem…`/`tab`, `summary`) shows the **pointer** cursor and disabled ones show **not-allowed** (#94; Tailwind v4 no longer gives buttons the pointer). Links get the pointer from the browser.

**Dangerous actions are red** (#95): every control that deletes or discards data uses `destructive` (filled, for the final confirmation and for "Delete account") or `destructive-ghost` (red text/icon, for inline actions such as removing a site). Disconnecting or signing out is not deletion and stays neutral; when disconnecting would discard unsynced time, the confirming button is `destructive`. The label always says what happens ("Remove leetcode.com"); colour is never the only signal.

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
  one headline number).
- **Headings (#78):** one `h1` per page (the header title); each card's `CardTitle` is an `h2`:
  `variant="label"` (default) is the quiet caption above a metric, `variant="section"` a page
  section title (Settings); a heading inside a card is an `h3` in `text-sm font-medium`, never
  larger than its `h2`. `tabular-nums` for every duration.
- **Spacing:** multiples of the Tailwind scale; sections in a view use `gap-3`, items inside a
  block `gap-1.5`/`gap-2`.
- **Durations:** always `formatDuration` from `@careeros/shared` (EXT-UI-02).
- **Accessibility (EXT-UI-09):** real `<button>`s with text (icon-only buttons need
  `aria-label`); status is text, never color alone; bars are decorative next to a text value;
  `:focus-visible` outline from `ring`; contrast ≥ WCAG AA in both themes.
- **Copy:** short, sentence case, no exclamation marks; errors say what to do next.
