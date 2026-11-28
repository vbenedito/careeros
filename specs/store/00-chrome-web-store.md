# Chrome Web Store publication (STORE)

Status: **Approved** (product owner, 2026-11-11) · **Published 2026-11-12**: https://chromewebstore.google.com/detail/pddbflgidjmnhidineoejneeipaicgek · Issue #128 · Listing: [`docs/chrome-web-store/listing.md`](../../docs/chrome-web-store/listing.md)

Amended 2026-11-11 (#131): STORE-01 and STORE-05 reworded so they read together; minimum Chrome version and build names added (STORE-07).

Amended 2026-11-12 (#156): STORE-08 checks the store package in CI.

Amended 2026-11-19 (#233, proposal): the same check applies before extension 0.3.1 (NeetCode, [PRB-21](../v1/01-problems.md)): listing text and privacy answers name NeetCode; permissions unchanged. Status: **Proposed**.

Amended 2026-11-20 (#240, NC-d): listing text and privacy answers for extension 0.3.1 written in [`listing.md`](../../docs/chrome-web-store/listing.md): the description, the `tabs` justification and the "Web history" row name NeetCode as well as LeetCode, and the setting is called "Track coding problems" (PRB-21, PRB-22). The 0.3.0 text stays in the history of `listing.md`. Permissions unchanged (STORE-03, STORE-08). Status: **Written**; the product owner approves it and submits the package after the PRB-22 guard count and the dashboard release.

Amended 2026-11-28 (#288, PS-d): listing text and privacy answers for extension 0.4.0 written in [`listing.md`](../../docs/chrome-web-store/listing.md) ([PSR-18](../v1/05-problem-sites.md)): the description, the `tabs` justification and the "Web history" row name the problem identifier from LeetCode, NeetCode and the problem sites the user adds; the remote-code answer stays No, with a note that problem sites are data (ADR-0015). Permissions unchanged (STORE-03, STORE-08). Status: **Written**; the product owner approves it and submits the package after the #287 dashboard release.

Amended 2026-11-17 (#176): before the release with LeetCode problems (#182), the listing text and the privacy answers are checked and updated for the problem slug ([PRB-17](../v1/01-problems.md)).

- **STORE-01** The store package is the production build without the manifest `key`: the store rejects a `key` in an upload and assigns the ID itself. `pnpm --filter @careeros/extension release:store` produces `careeros-extension-<version>-store.zip`. Unpacked development and production builds keep their pinned keys (ENV-05); for production that key is the store item's own public key (STORE-05), so both share one ID.
- **STORE-02** The manifest description is the store summary: ≤ 132 characters, and it claims no more than SEC-01.
- **STORE-03** Permissions stay exactly SEC-03 (`alarms`, `idle`, `storage`, `tabs`), with no host permissions and no remote code (SEC-04). Each has a written justification in the listing document.
- **STORE-04** The listing's data-use disclosures and privacy policy URL match SEC-01 and `/privacy` (SEC-13).
- **STORE-05** After the first upload, the store item's public key and ID replaced `MANIFEST_KEYS.production` in `apps/extension/manifest.config.ts`, so unpacked production builds and the store item share one ID (done 2026-11-11: `pddbflgidjmnhidineoejneeipaicgek`); the store zip still has no `key` (STORE-01); the dashboard's `NEXT_PUBLIC_EXTENSION_ID` is that ID (AUTH-06); after publication, `EXTENSION_INSTALL_URL` is the listing URL (LAND-05). A dashboard domain change now also needs a store update (`externally_connectable`).
- **STORE-06** Store images use sample data only, never a real user's.
- **STORE-07** Every build sets `minimum_chrome_version` `120`. The production build (and the store item) is named "CareerOS"; the development build is "CareerOS (dev)" with its own pinned ID `jfklbpedlpkginmdfckogdgaggmdmkbk`, so both can be installed side by side.
- **STORE-08** CI builds the store zip on every pull request (`pnpm check:store-package`, placeholder public values, no secrets) and fails if its `manifest.json` has a `key`, permissions other than exactly `alarms`, `idle`, `storage`, `tabs`, any `host_permissions`, optional permissions or `content_scripts`, an `externally_connectable.matches` other than the dashboard origin it was built with, a `version` different from `apps/extension/package.json`, a `minimum_chrome_version` other than `120`, a name other than "CareerOS" or a changed extension-pages CSP; or if the zip contains source maps or `.env` files.
- **STORE-09** (amended 2026-11-19, #229) The store icon and the extension icons show the CareerOS logo mark (`docs/marketing/brand`): small cut at 16 and 32 px, standard cut from 48 px; the store icon is 128×128 with the 96×96 artwork and 16 px transparent padding. Promo tiles and screenshots that show the logo show the same mark.

v0's "Chrome Web Store publication" (out of scope in `specs/v0/00-product.md` §5) is delivered by this iteration.
