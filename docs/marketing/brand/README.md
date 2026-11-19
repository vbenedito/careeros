# CareerOS logo (#195)

Direction C: a **C** with a dot beside its opening. It reads as C + O ("career O S") and as one chosen site next to the time ring. Calm, one shape, no clock.

Related: [brand profile](../brand-profile.md) section 12, [design system](../../design-system.md).

## Files

| File | Use it for |
|---|---|
| `careeros-mark.svg` | Mark on light surfaces (white or light pages, docs, slides). 32 px and up. |
| `careeros-mark-dark.svg` | Mark on dark surfaces (the landing page, dark slides, dark video). 32 px and up. |
| `careeros-mark-small.svg` | Mark below 32 px (favicon-size, small UI, 16 to 31 px), light surfaces. Thicker C, bigger dot. |
| `careeros-mark-small-dark.svg` | Same, for dark surfaces. |
| `careeros-lockup.svg` | Mark + "CareerOS" on light surfaces. |
| `careeros-lockup-dark.svg` | Mark + "CareerOS" on dark surfaces. |
| `careeros-avatar.svg`, `careeros-avatar-dark.svg` | Full-bleed square sources for social avatars (no rounded corners; platforms crop). |
| `careeros-avatar-light-1024.png`, `-400.png` | Light avatar, ready to upload. |
| `careeros-avatar-dark-1024.png`, `-400.png` | Dark avatar, ready to upload. |

Light avatar for TikTok, YouTube and LinkedIn by default. The glyph sits well inside the circle crop (all of it is within 65% of the radius of the inscribed circle). The light avatar's navy disc has weak edge contrast on a dark-mode feed (1.25:1 on `#0e0f12`; the glyph itself stays 9.84:1). Use the light avatar everywhere; the dark avatar is for surfaces that are always dark (for example a dark end card), not for a profile picture, because a profile shows the same image in light and dark mode.

## Colours

| Role | Hex | Source |
|---|---|---|
| Tile, light variant | `#102252` | brand, `oklch(0.27 0.09 265)` |
| Glyph, light variant | `#b4d1ff` | brand, `oklch(0.86 0.09 265)` |
| Tile, dark variant | `#79a1fc` | `--primary` dark, `oklch(0.72 0.14 265)` |
| Glyph, dark variant | `#102252` | same navy |
| Wordmark "OS", on light | `#325ac2` | `--primary` light, `oklch(0.5 0.17 265)` |
| Wordmark "OS", on dark | `#79a1fc` | `--primary` dark |
| Wordmark "Career", on light | `#0a0a0a` | `--foreground` light |
| Wordmark "Career", on dark | `#fafafa` | `--foreground` dark |
| Light surface | `#ffffff` | `--background` light |
| Dark surface | `#0e0f12` | `--background` dark |

Hex values are the sRGB conversion of the OKLCH tokens in `packages/shared/theme/tokens.css`; if the tokens change, the logo does not change by itself.

## Contrast (WCAG 2.x)

| Pair | Ratio | Needs |
|---|---|---|
| Glyph on tile, light variant (`#b4d1ff` on `#102252`) | 9.84:1 | 3:1 |
| Glyph on tile, dark variant (`#102252` on `#79a1fc`) | 6.06:1 | 3:1 |
| Light-variant tile on white | 15.30:1 | 3:1 |
| Dark-variant tile on dark surface (`#79a1fc` on `#0e0f12`) | 7.59:1 | 3:1 |
| Light-variant tile on dark surface (why the dark variant exists) | 1.25:1 | do not use |
| "Career" on light / dark | 19.80:1 / 18.36:1 | 4.5:1 |
| "OS" on light / dark | 6.22:1 / 7.59:1 | 4.5:1 |

## Size and space

- Minimum size: mark 32 px (use the small mark from 16 to 31 px; never below 16 px). Lockup: 120 px wide.
- Clear space: one quarter of the tile height on every side, and keep other logos, text and edges out of it.
- Do not recolour, rotate, stretch, add shadows, or put the light-variant tile on a dark surface (use the dark files).

## Wordmark font

"CareerOS" is set in Inter Display Bold (SIL Open Font License) and converted to SVG paths. No font needs to be installed. Font credit: Inter, © The Inter Project Authors, SIL OFL 1.1, outlined; no font file is shipped. Spacing is the font's own with -1% tracking; "OS" takes the accent colour.

## Where the mark is used

The website switched to this mark in #225 (favicon is `careeros-mark-small.svg`; sidebar and sign-in use the `brand` / `brand-foreground` tokens). The Chrome extension icons (`apps/extension/public/icons`, rendered by `apps/extension/scripts/icons.ts`) and the store images (`docs/chrome-web-store/assets/`, `apps/extension/scripts/store-assets.ts`) switched to this mark in #229: small cut at 16 and 32 px, standard cut from 48 px, light variant. A toolbar icon cannot follow the browser theme, so the light variant is used on both: on a dark toolbar (`#202124`, `#35363a`) the navy tile is nearly invisible (1.05:1 and 1.27:1) but the pale-blue glyph reads (9:1 or more), and on white the tile is 15.3:1. The dark variant would read on both toolbars (6.4:1 and 4.8:1 on dark, 2.5:1 on white) and is the alternative if the product owner prefers a visible tile on dark.
