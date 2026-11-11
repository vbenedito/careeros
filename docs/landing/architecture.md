# Landing page — architecture proposal (#99)

Status: **Decided** (tech lead, by delegation from the product owner, 2026-11-10) · 2026-11-10 · Part of #102 · ADR draft: [ADR-0009](../adr/0009-landing-route-and-rendering.md).

> **As built (2026-11-11):** a static route handler at `/` with inline CSS allowed by hash, dark only, plus a CSS-only pause control. There is no prebuild step, proxy rewrite or `/landing/` folder: see [LAND-01..08](../../specs/landing/00-landing.md) and the ADR-0009 implementation note. The sections below record the original proposal.

## 1. Recommendation in short

1. **Route:** the landing page at `/`; the dashboard moves to `/dashboard`. A signed-in visitor who opens `/` is redirected to `/dashboard` (query string kept), so old links and the current extension keep working.
2. **Rendering:** the landing page is **pre-built static HTML and CSS with no JavaScript**, generated at build time from React components and the same design tokens. It is a static file (cached at the CDN; the proxy still runs first to check the session) with its own strict security policy (`script-src 'none'`). Every other page stays as it is: rendered per request with a nonce (SEC-09).
3. **Links in one place:** the install link and the site address come from configuration (the repository link is a constant), so the Chrome Web Store and the custom domain are configuration changes.
4. **Scope:** a new feature outside the approved v0 spec, delivered as its own small iteration with a short spec (LAND-xx) approved before implementation (#101).

## 2. Route

| Option | For | Against |
|---|---|---|
| **A. Landing at `/`, dashboard at `/dashboard`** (recommended) | The root address is what people type and share, and what search engines rank first; the product's home explains the product | Touches the app's links, redirects and tests (list below) |
| B. Landing at another path (`/home`, `/about`) | No change to the app | Visitors at `/` are still sent to a sign-in page; the root address, the strongest one, is wasted for search |

**Signed-in visitors at `/`:** the proxy already verifies the session on every request (`getClaims()`), so it reuses that result: signed in → redirect to `/dashboard`, keeping the query string (old `/?view=…` links keep their period); signed out → the static landing page. The redirect only chooses a destination; `/dashboard` stays guarded as today. So the extension's "Open dashboard", old bookmarks and `not-found` links keep working without a release.

**Impact list for A:**

| Area | Change |
|---|---|
| `app/(app)/page.tsx` | Moves to `app/(app)/dashboard/page.tsx`; its hard-coded `/?view=` "Try again" link uses `periodHref` |
| Sidebar, `not-found`, privacy header | Links: dashboard → `/dashboard` (and the sidebar's `pathname === "/"` active check); the privacy page's wordmark → `/` (landing). Sign-out keeps going to `/sign-in` |
| `periodHref` and dashboard period links | `/?view=…` → `/dashboard?view=…` (DASH-05) |
| `proxy.ts` and `PUBLIC_PATHS` (AUTH-03) | `/` public as an **exact** match; signed in at `/` → `/dashboard`; signed in at `/sign-in` → `/dashboard`; static landing rewritten at `/` with **only** its own CSP (the nonce CSP is not added to that response). **Every public asset is also public:** the landing CSS and images, OG image, icons, web manifest, `robots.txt`, `sitemap.xml`, `llms.txt` (today they would redirect to sign-in) |
| `safeNextPath`, `/auth/callback`, sign-in form (default `next`) | Default destination after sign-in `/` → `/dashboard` |
| Extension `openDashboard()` default | `/` → `/dashboard` in the next extension release (old builds still work through the redirect) |
| Specs | DASH-01..05 and AUTH-03 route names; new LAND spec |
| Tests | Unit (`safeNextPath`, `periodHref`, routes, sidebar, sign-in form), integration (auth guard and redirects in `auth.int.test.ts`, `/?view=` URLs in `dashboard.int.test.ts`, **an anonymous 200 for every public asset**), E2E (dashboard journey URLs). apps/web has no Playwright setup yet: the landing E2E, CSP check and screenshot script add one |
| Docs | README, architecture diagram, operations |

## 3. Rendering and security policy

Today every page is rendered per request, because the nonce-based CSP needs a fresh nonce each time (SEC-09). The Next.js documentation confirms both halves of the problem:
- a nonce requires dynamic rendering;
- the static alternative (experimental SRI) adds hashes for script **files** only, while Next.js also adds **inline** scripts to every page.

| Option | Speed and SEO | Security | Effort | Verdict |
|---|---|---|---|---|
| **A. Pre-built static HTML + CSS, no JavaScript** | Best: a cached static file after a light proxy check, nothing to download or run, fast LCP | Strictest of all: `script-src 'none'` | A build step renders the landing components to HTML and compiles their CSS, plus a proxy rewrite | **Recommended** |
| B. A normal Next.js page rendered per request (as today) | Good, not best: each visit waits for the server, and the React runtime still downloads | Unchanged (nonce) | Least: just a page | Fallback, if A's build step proves fragile |
| C. A static Next.js page with a relaxed policy (`'unsafe-inline'`) | Good | **Rejected.** The landing page shares the origin with the app; a script injected there could call `/api/extension/link` with the visitor's cookies (the worst case in ADR-0003) | Little | No |

**What option A means in practice:**
- The landing sections are React server components using the shared tokens (`packages/shared/theme/tokens.css`) and Tailwind. A build script (`scripts/landing/build.ts`) renders them to `index.html` and outputs one hashed CSS file and the images.
  - It runs as a `prebuild` step, so the files are in `apps/web/public/landing/` before `next build`; the output is git-ignored.
  - No React code runs in the browser, so there is nothing to hydrate.
- **Theme:** follows the visitor's system setting with `prefers-color-scheme` (pure CSS, no flash). The dashboard's manual theme switch does not apply to the landing page; most marketing sites behave this way. The landing styles use **only the shared tokens**, which already switch under `prefers-color-scheme`: Tailwind's `dark:` classes depend on a `.dark` class the landing page won't have. Dark screenshots use `<picture>` with `media="(prefers-color-scheme: dark)"`.
- **Motion:** CSS only (fade and rise), disabled under `prefers-reduced-motion`.
- **JSON-LD:** `<script type="application/ld+json">` is a data block: HTML stops processing a script with a non-JavaScript type before the CSP check, so Chrome, Firefox and Safari neither run nor block it under `script-src 'none'`. An E2E test confirms **zero CSP violations**.
- **CSP for the landing response:** `default-src 'none'; img-src 'self' data:; style-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'none'` (no `font-src`: system fonts). The landing page has no forms: the CTAs are links to `/sign-in`. The static security headers (HSTS, COOP, CORP, nosniff, Referrer-Policy) stay on all responses.
- **Caching:** long cache for the hashed CSS and images; the HTML revalidates on each deploy.
- **Direct access:** the proxy answers `/landing/index.html` with a 308 redirect to `/`, so only `/` is ever indexed. The `/landing/` folder is **not** blocked in robots.txt: its CSS and images must stay crawlable so Google renders `/` correctly. No `noindex` goes inside the file, since `/` serves it.
- **Security review:** like every change, an independent review checks the rewrite, the signed-in redirect (it only chooses a destination, never grants access) and the separate CSP.

## 4. Configuration: links and addresses

One module, `apps/web/lib/landing/links.ts`, reads at build time:

| Setting | Now | Later |
|---|---|---|
| `SITE_URL` (existing) | `https://careeros-taupe.vercel.app` | The custom domain: canonical, sitemap, OG URLs follow |
| `EXTENSION_INSTALL_URL` (new) | The Chrome Web Store listing (set when the listing is published; the landing page launches after that) | — |
| Repository URL (constant in the same module) | `https://github.com/vbenedito/careeros` | — |

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

## 8. Decisions (2026-11-10)

1. **Route A:** landing at `/`, dashboard at `/dashboard` (product owner).
2. **Rendering A:** pre-built static HTML, no JavaScript (tech lead). The product owner asked whether plain Next.js static rendering, or server rendering with a cache, would do:
   - **For SEO they are equal.** Static, server-rendered and pre-built pages all give crawlers the full HTML; what search engines reward beyond that is speed, and static wins it.
   - **Next.js static rendering:** possible, but Next.js adds inline scripts to every page, and our strict security policy (SEC-09) only allows them with a per-request nonce, which a static page cannot have. Using it would mean relaxing the policy (`'unsafe-inline'`) on a page that shares the origin with the app (option C, rejected).
   - **Server rendering with a cache:** has the same conflict. A cached page carries an old nonce that no longer matches the response's policy, so its scripts are blocked.
   - **Option A *is* static rendering:** written as React components in the Next.js app, rendered to HTML at build time, without the inline scripts. It is the fastest and the most secure.
   - Option B (a normal per-request Next.js page) stays the fallback if the build step proves fragile.
3. **Iteration:** the landing page is its own small iteration with a LAND spec (tech lead). Order (product owner): build the landing page, publish the extension to the Chrome Web Store, then launch the landing page with the store link.
