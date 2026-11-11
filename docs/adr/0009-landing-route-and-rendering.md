# ADR-0009 — Landing page at `/`, pre-built static HTML with its own CSP

Status: **Accepted** (tech lead, by delegation from the product owner) · Date: 2026-11-10 · Issue: #99 · Details: [`docs/history/landing/architecture.md`](../history/landing/architecture.md)

## Context
A public landing page (#102) needs the root address for search and sharing, and should be as fast as possible. Today `/` is the dashboard, and every page is rendered per request because the CSP uses a per-request nonce (SEC-09). Next.js cannot keep a strict CSP on statically generated pages: its SRI option hashes script files only, while each page also carries inline scripts.

## Options
1. Landing at another path; no app change. Wastes the root address.
2. Landing at `/` as a normal Next.js page rendered per request. Same CSP model; slower, and ships the React runtime.
3. Landing at `/` as a static Next.js page with `'unsafe-inline'`. Rejected: same origin as the app, so an injection there reaches the link route with the user's cookies (ADR-0003).
4. **Landing at `/` as pre-built HTML and CSS without JavaScript**, rendered at build time from React components and the shared tokens, with `script-src 'none'`. The dashboard moves to `/dashboard`; a signed-in visitor at `/` is redirected there (the proxy's existing session check).

## Decision
Option 4, with option 2 as the fallback if the build step proves fragile.

## Consequences
+ Fastest possible page (a cached static file, no JavaScript) and the strictest CSP in the app.
+ Install and site links come from configuration (Chrome Web Store, custom domain).
− A second rendering path (a build script) to maintain; the landing theme follows the system setting only.
− The dashboard URL changes: links, redirects, specs and tests are updated; old links keep working through the redirect.
− The signed-in redirect only picks a destination; authentication stays with the existing guard. Public assets (landing CSS and images, OG image, icons, web manifest, robots.txt, sitemap.xml, llms.txt) must be added to the proxy's public paths.

## Implementation note (2026-11-11)
Built as a static Next.js route handler at `/` returning the pre-rendered HTML with its CSS inline (allowed by hash), instead of a prebuild step and a proxy rewrite: same properties, one response, no `/landing/` files. Dark only, as in the approved design. See LAND-01..08.

## Update 2026-11-11 (#131)
The implementation note supersedes parts of the Consequences: there is no build script (a static route handler instead), the landing page is dark only (it does not follow the system setting), and there is no web manifest or `llms.txt` yet. Mona Sans is self-hosted under `/fonts` (`font-src 'self'`), which is a public path.
