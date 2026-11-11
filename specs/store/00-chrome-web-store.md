# Chrome Web Store publication (STORE)

Status: **Approved** (product owner, 2026-11-11) · Issue #128 · Listing: [`docs/chrome-web-store/listing.md`](../../docs/chrome-web-store/listing.md)

- **STORE-01** The store package is the production build without the manifest `key`: the store assigns the extension ID. `pnpm --filter @careeros/extension release:store` produces `careeros-extension-<version>-store.zip`. Unpacked development and production builds keep their pinned keys (ENV-05).
- **STORE-02** The manifest description is the store summary: ≤ 132 characters, and it claims no more than SEC-01.
- **STORE-03** Permissions stay exactly SEC-03 (`alarms`, `idle`, `storage`, `tabs`), with no host permissions and no remote code (SEC-04). Each has a written justification in the listing document.
- **STORE-04** The listing's data-use disclosures and privacy policy URL match SEC-01 and `/privacy` (SEC-13).
- **STORE-05** After the first upload, the store item's public key and ID replace `MANIFEST_KEYS.production`, so unpacked production builds and the store item share one ID (done 2026-11-11: `pddbflgidjmnhidineoejneeipaicgek`); the dashboard's `NEXT_PUBLIC_EXTENSION_ID` is that ID (AUTH-06); after publication, `EXTENSION_INSTALL_URL` is the listing URL (LAND-05). A dashboard domain change now also needs a store update (`externally_connectable`).
- **STORE-06** Store images use sample data only, never a real user's.

v0's "Chrome Web Store publication" (out of scope in `specs/v0/00-product.md` §5) is delivered by this iteration.
