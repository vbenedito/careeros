# ADR-0015 — User problem rules as data, read by a fixed matcher

Status: Proposed · Date: 2026-11-27 · Issue: #245

## Context
Problem tracking (PRB-01..23) works on a fixed list of sites, `PROBLEM_DOMAINS` (`leetcode.com`, `neetcode.io`, PRB-18), with one fixed path rule `/problems/<slug>`. The list is in `packages/shared` and in the database (`private.problem_domains()` and a check on `study_session_problems`). Adding a site needs a migration, an extension release and a Chrome Web Store review (#233).

The product owner wants a user to paste an example problem URL (for example `https://www.hellointerview.com/practice/system-design/cmlz26cxp08st08adxvy89hr1?q=non-functional-requirements`) and get time per problem on that site with no new extension release (#245).

Constraints:
- SEC-01: only the minimum of an address is kept; today only the slug, on two sites. SEC-03 and ADR-0006: permissions are exactly `tabs`, `idle`, `alarms`, `storage`; no host permissions, no content scripts.
- STORE-03, SEC-04: no remote code. The Chrome Web Store says an MV3 extension's full functionality must be discernible from its submitted code; it may load data and remote configuration "where all logic for the functionality is contained within the extension package", but must not "execute a string fetched from a remote source" or build "an interpreter to run complex commands fetched from a remote source, even if those commands are fetched as data" ([Additional Requirements for Manifest V3](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)). Chrome's migration guide defines remotely hosted code as code the browser executes, and says it "does not include data or things like JSON or CSS" ([Improve extension security: remotely hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)).
- User data policy: web browsing activity may be collected only "to the extent required for a user-facing feature" ([User data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)); the disclosures in the Privacy practices tab must match the privacy policy ([Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)).
- SYNC-09..09d: the extension already downloads the tracked sites and the problem setting from the server as data, validated by shared schemas.
- release.md: expand → deploy → contract; released extensions stay for weeks; ENV-05c gates dashboard features on the store version.

## Options
1. **Fixed list per release** (today) — each new site is a code change, a migration and a store release. Pros: smallest privacy surface; the store reviewer sees every site. Cons: slow (days to weeks per site); the team must choose sites for users; does not meet #245.
2. **Rules as data, fixed matcher** — the user creates a rule in the dashboard: a tracked domain (TRK-03), 1–3 literal path segments, and an id kind from a fixed list (`slug`, `token`). The extension downloads rules with the tracked sites and applies them with fixed code: compare literal segments, then check one segment against one of two patterns shipped in the package. Pros: one release, then no more releases per site; fits the existing "sites as data" pattern; still only one path segment kept; no new permission. Cons: more code and tests (schema in three places); store text and privacy page must say "sites you add"; ids of user sites are opaque (hard to read).
3. **Content scripts or host permissions** — read the page (title, problem name) on user sites, with optional host permissions per site. Pros: readable names. Cons: new permissions and install or runtime prompts (ADR-0006 already rejected per-site host permissions); reads page content, against SEC-01; heavier store review. Rejected.
4. **User (or server) regex or script** — a rule is a regular expression or a small expression language. Pros: covers every URL shape, including the query string. Cons: a remote regex is logic that the reviewer cannot see in the package, close to the "interpreter" the policy forbids; ReDoS risk in the service worker; easy to capture too much (emails, tokens in the query). Rejected.

## Decision
Option 2. Rules are plain data with a strict template language: host = one of the user's tracked domains, a fixed prefix of literal segments, exactly one id segment checked by a fixed pattern and a max length; the query string and the fragment are never read or kept. The matcher is fixed, non-Turing-complete code in `packages/shared`; no `RegExp`, `Function` or code is ever built from server data, so the "Remote code" answer stays **No**. LeetCode and NeetCode become built-in rules with the same shape, kept in code. The problem stays the pair domain + id of #233 (PRB-19); rules add to the NC-a..e model, they do not replace it. Requirements: [05-problem-sites](../../specs/v1/05-problem-sites.md) (PSR-01..24).

## Consequences
+ After one extension release (0.4.0, gated by `EXTENSION_FEATURES`), a user adds a site without a release or a migration.
+ The privacy boundary stays one path segment with a fixed pattern; the example URL never leaves the browser.
+ The rule count is a plan limit (ENT), ready for a paid plan later.
− SEC-01, the privacy page and the store "Web history" text change from "LeetCode and NeetCode" to "LeetCode, NeetCode and the problem sites you add". A store reviewer may ask about it; the answer is that rules are data and the matcher is in the package.
− The server cannot check the path prefix (it never sees the path); it checks only that the domain has a rule and the id fits the pattern. The prefix is checked in the extension.
− Opaque ids make rows hard to read until the user can name a problem (proposed P1).
− Some URL shapes are not supported (id in the query string, id at the path root, more than 3 prefix segments). We accept this for a simpler, safer language.

## Links
- Spec: [specs/v1/05-problem-sites.md](../../specs/v1/05-problem-sites.md); builds on [specs/v1/01-problems.md](../../specs/v1/01-problems.md) and [specs/v1/02-entitlements.md](../../specs/v1/02-entitlements.md)
- ADRs: [0006](0006-tabs-permission.md), [0011](0011-ingest-v2.md), [0012](0012-entitlements.md)
- Chrome Web Store: [Additional Requirements for Manifest V3](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements), [Remotely hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code), [User data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
