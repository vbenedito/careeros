# Release process

Type: living · Owner: tech lead · Last reviewed: 2026-11-11

How each part of CareerOS reaches users. Steps marked **Proposed** have not been practised yet. Account-specific production settings are kept privately by the product owner and are not repeated here.

## Dashboard

| Step | How |
|---|---|
| Build and deploy | Vercel's GitHub integration builds `apps/web` for every pull request (preview, protected) and deploys production when a PR is merged to `main` |
| Environment | Set in Vercel per environment; the list and rules are ENV-05b in [specs/v0/09-environments.md](../../specs/v0/09-environments.md). `SUPABASE_SECRET_KEY` is scoped to Production only |
| Build-time values | `EXTENSION_INSTALL_URL`, `SITE_URL` and the `PRIVACY_*` values are read at build time (static landing page, robots, sitemap, the production build check). After changing them, **redeploy** |
| Check | CI green before merge; after deploy, open `/`, sign in, open `/dashboard` and `/connect` |
| Rollback | Promote the previous production deployment in Vercel, or revert the commit on `main` |

## Extension

The version is `version` in `apps/extension/package.json`; the manifest takes it from there. Use semantic versioning.

| Step | How |
|---|---|
| 1. Bump | Raise `version` in `apps/extension/package.json` in a PR (e.g. `chore(extension): version 0.1.1 …`) |
| 2. Build | With `apps/extension/.env.production` in place: `pnpm --filter @careeros/extension release` (unpacked zip with the `key`) and `pnpm --filter @careeros/extension release:store` (store zip without `key`, STORE-01) |
| 3. GitHub Release | Tag `vX.Y.Z`, attach `careeros-extension-X.Y.Z.zip`, add install/update notes: load unpacked → replace the folder → reload (ENV-05a). Done for v0.1.0 and v0.1.1 |
| 4. Chrome Web Store | Upload the `-store.zip` in the Developer Dashboard; the listing text, permission justifications and data disclosures are in [listing.md](../chrome-web-store/listing.md) (STORE-02..06). Submit for review |
| 5. After publication | Set `EXTENSION_INSTALL_URL` to the listing URL and redeploy the dashboard (LAND-05) |

The first store submission is in progress. Until a store version has been published and updated once, these parts are **Proposed**:

- **Store update:** bump the version, build `release:store`, upload as a new package, submit for review. Users get it through Chrome's automatic updates.
- **Store rollback:** the store cannot reinstate an older package directly. Rebuild the last good commit with a **higher** version number and submit it. For a serious problem, unpublish the item while the fix is in review.
- **Review rejection:** fix what the reviewer names, keeping SEC-01/SEC-03 and the listing in sync (STORE-03/04), and resubmit.

## Database migrations

| Step | How |
|---|---|
| Write | A new file in `supabase/migrations`; never edit an applied one. pgTAP tests in the same PR |
| Test | `pnpm db:reset && pnpm db:test` locally; CI applies all migrations to a fresh stack and runs pgTAP, integration, E2E and the backup round trip |
| Apply to production | After the PR is merged: `pnpm exec supabase link --project-ref <ref>`, then `pnpm exec supabase db push --remote`. Supabase CLI 3 targets the local stack unless `--remote` is given ([operations](../operations.md#restore-procedure), [test report](../history/delivery/v0-test-report.md)) |
| Order | Apply the migration **before** deploying code that needs it. Migrations must keep the currently deployed dashboard and every released extension working (add, then use; never remove in the same release) |
| Rollback | **Proposed:** a new forward migration that undoes the change. For data loss, restore from the backup ([operations §4](../operations.md#4-backups)) |

## Compatibility rules

| Change | Rule |
|---|---|
| Dashboard ↔ extension protocol | Every message carries `protocolVersion` (AUTH-07a). The dashboard accepts `DASHBOARD_PROTOCOL_VERSIONS`, the extension `SUPPORTED_PROTOCOL_VERSIONS`; both are `[1]`. **Proposed** for a version 2: release the extension supporting `[1, 2]` first, then the dashboard; drop 1 only after users have updated. The dashboard shows "Please update the extension" when it cannot talk to an installed version |
| Ingest and tracked-domain API | Older extensions stay installed for a long time, unpacked ones never update by themselves. Keep `ingest_study_sessions(sessions jsonb)` and `tracked_domains` backward compatible |
| Dashboard domain | The extension only accepts messages from `VITE_DASHBOARD_ORIGIN` (`externally_connectable`, AUTH-06). A new domain needs a new extension build with the new origin, a store review and a GitHub Release **before** the dashboard moves; then update `SITE_URL`, the Supabase Auth redirect URLs (SEC-11) and redeploy |
| Supabase project | A new project changes `VITE_SUPABASE_URL` and the publishable key: a new extension release is needed ([operations restore](../operations.md#restore-procedure)) |
| Extension ID | Pinned by `MANIFEST_KEYS`; the dashboard's `NEXT_PUBLIC_EXTENSION_ID` must match (AUTH-06, STORE-05) |
