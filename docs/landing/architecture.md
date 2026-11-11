# Landing page — architecture proposal (#99)

Status: **Proposal for the product owner** · 2026-11-10 · Part of #102 · ADR draft: [ADR-0009](../adr/0009-landing-route-and-rendering.md).

## 1. Recommendation in short

1. **Route:** the landing page at `/`; the dashboard moves to `/dashboard`. A visitor who has a session cookie and opens `/` is redirected to `/dashboard`, so old links and the current extension keep working.
2. **Rendering:** the landing page is **pre-built static HTML and CSS with no JavaScript**, generated at build time from React components and the same design tokens. It is served from the CDN with its own strict security policy (`script-src 'none'`). Every other page stays as it is: rendered per request with a nonce (SEC-09).
3. **Links in one place:** the install link, repository link and site address come from configuration, so the Chrome Web Store and the custom domain are configuration changes.
4. **Scope:** a new feature outside the approved v0 spec, delivered as its own small iteration with a short spec (LAND-xx) approved before implementation (#101).

## 2. Route

| Option | For | Against |
|---|---|---|
| **A. Landing at `/`, dashboard at `/dashboard`** (recommended) | The root address is what people type and share, and what search engines rank first; the product's home explains the product | Touches the app's links, redirects and tests (list below) |
| B. Landing at another path (`/home`, `/about`) | No change to the app | Visitors at `/` are still sent to a sign-in page; the root address, the strongest one, is wasted for search |

**Signed-in visitors at `/`:** the proxy checks only whether a Supabase session cookie is present (no network call). If it is, it redirects to `/dashboard`; if not, it serves the static landing page. An expired cookie lands on `/dashboard`, which already sends the visitor to sign in. So the extension's "Open dashboard", old bookmarks and `not-found` links keep working without a release.

**Impact list for A:**

| Area | Change |
|---|---|
| `app/(app)/page.tsx` | Moves to `app/(app)/dashboard/page.tsx` |
| Sidebar, `not-found`, privacy header | Links: dashboard → `/dashboard`; the privacy page's wordmark → `/` (landing) |
| `periodHref` and dashboard period links | `/?view=…` → `/dashboard?view=…` (DASH-05) |
| `proxy.ts` (AUTH-03) | `/` is public; session cookie at `/` → redirect to `/dashboard`; signed in at `/sign-in` → `/dashboard`; static landing served at `/`, with its own CSP |
| `safeNextPath`, `/auth/callback`, sign-in form | Default destination after sign-in `/` → `/dashboard` |
| Extension `openDashboard()` default | `/` → `/dashboard` in the next extension release (old builds still work through the redirect) |
| Specs | DASH-01..05 and AUTH-03 route names; new LAND spec |
| Tests | Unit (`safeNextPath`, `periodHref`, routes), integration (auth guard, redirects), E2E (dashboard journey URLs) |
| Docs | README, architecture diagram, operations |

## 3. Rendering and security policy

Today every page is rendered per request, because the nonce-based CSP needs a fresh nonce each time (SEC-09). The Next.js documentation confirms both halves of the problem:
- a nonce requires dynamic rendering;
- the static alternative (experimental SRI) adds hashes for script **files** only, while Next.js also adds **inline** scripts to every page.

| Option | Speed and SEO | Security | Effort | Verdict |
|---|---|---|---|---|
| **A. Pre-built static HTML + CSS, no JavaScript** | Best: served from the CDN, nothing to download or run, fast LCP | Strictest of all: `script-src 'none'` | A build step renders the landing components to HTML and compiles their CSS, plus a proxy rewrite | **Recommended** |
| B. A normal Next.js page rendered per request (as today) | Good, not best: each visit waits for the server, and the React runtime still downloads | Unchanged (nonce) | Least: just a page | Fallback, if A's build step proves fragile |
| C. A static Next.js page with a relaxed policy (`'unsafe-inline'`) | Good | **Rejected.** The landing page shares the origin with the app; a script injected there could call `/api/extension/link` with the visitor's cookies (the worst case in ADR-0003) | Little | No |

**What option A means in practice:**
- The landing sections are React server components using the shared tokens (`packages/shared/theme/tokens.css`) and Tailwind. A build script (`scripts/landing/build.ts`) renders them to `index.html` and outputs one hashed CSS file and the images.
  - The output goes into `apps/web/public/landing/` and runs during `next build`.
  - No React code runs in the browser, so there is nothing to hydrate.
- **Theme:** follows the visitor's system setting with `prefers-color-scheme` (pure CSS, no flash). The dashboard's manual theme switch does not apply to the landing page. Most marketing sites behave this way.
- **Motion:** CSS only (fade and rise), disabled under `prefers-reduced-motion`.
- **JSON-LD:** `<script type="application/ld+json">` is a data block that browsers never execute. An E2E test checks the page loads with **zero CSP violations** under `script-src 'none'`. If any browser reported one, the fallback is to allow exactly that block by its SHA-256 hash, computed at build time.
- **CSP for the landing response:** `default-src 'none'; img-src 'self' data:; style-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; script-src 'none'`. The static security headers (HSTS, COOP, CORP, nosniff, Referrer-Policy) stay on all responses.
- **Caching:** long cache for the hashed CSS and images; the HTML revalidates on each deploy.
- **Security review:** like every change, an independent review checks the rewrite, the cookie-presence redirect (it must never be used as authentication: it only chooses where to send the visitor) and the separate CSP.

## 4. Configuration: links and addresses

One module, `apps/web/lib/landing/links.ts`, reads at build time:

| Setting | Now | Later |
|---|---|---|
| `SITE_URL` (existing) | `https://careeros-taupe.vercel.app` | The custom domain: canonical, sitemap, OG URLs follow |
| `EXTENSION_INSTALL_URL` (new, optional) | The GitHub release page | The Chrome Web Store listing |
| Repository URL | `https://github.com/vbenedito/careeros` | — |

Changing a link means updating the Vercel setting and redeploying; no code change.

## 5. Privacy (unchanged rules)

- No analytics, tracking or third-party scripts (SEC-15); the landing page makes **no** third-party requests at all.
- Fonts are the system stack (nothing to download); images are self-hosted.
- The privacy page stays linked from the header and footer.

## 6. Assets

- **Screenshots** of the dashboard and popup, light and dark, generated by a script with Playwright from the app running against the **local** stack with a seeded **sample** account. Never real user data, never production.
- Re-generated by the same script when the UI changes, so the page never shows an outdated UI.
- The OG image (1200×630) is rendered the same way from the hero.
- Formats: AVIF with a WebP fallback (`<picture>`), explicit sizes, and `srcset` for 1× and 2×.

## 7. Scope and iteration

- The landing page is **not** in the approved v0 scope (product spec §5 lists only Dashboard, Settings, Sign-in, Connect and Privacy pages). It is a new feature.
- **Proposal:** a small iteration, *Public landing page*, with a spec `specs/landing/00-landing.md` (LAND-01…) written from these four documents once they are approved, then the design (#100) and the implementation (#101).
- The Chrome Web Store iteration later only changes `EXTENSION_INSTALL_URL` on the landing side.

## 8. Decisions requested

1. Route A (landing at `/`, dashboard at `/dashboard`)?
2. Rendering A (static HTML, no JavaScript), with B as the fallback?
3. The landing page as its own small iteration with a LAND spec?
