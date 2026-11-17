# ADR-0006 — `tabs` permission instead of per-site host permissions

Status: Accepted · Date: 2026-11-04

## Context
To know whether the active tab is on a tracked domain, the extension needs the tab URL. Chrome exposes `Tab.url` only with the `tabs` permission or a host permission for that site.

## Options
1. **`tabs` permission** — URL of every tab; install warning "Read your browsing history".
2. **Optional host permissions per tracked domain** (`chrome.permissions.request`) — URL only for tracked sites; smaller warning. But permission requests need a user gesture inside the extension, so domains added from the dashboard would not work until the user grants them in the popup; more states and UX.

## Decision
Option 1 for v0, with strict handling: only the hostname is derived, compared in memory and discarded unless tracked (SEC-01/02), enforced by tests (SEC acceptance 2). Option 2 is a candidate hardening for the Chrome Web Store iteration.

## Consequences
+ Domains added anywhere work immediately; simpler code and UX.
− Broader permission than strictly necessary; must be explained in the privacy page and README.

## Update 2026-11-11 (#131)
Decided for the Chrome Web Store iteration: the `tabs` permission is kept and option 2 is not adopted (STORE-03, permissions stay exactly SEC-03).

## Update 2026-11-17 (#176)
v1 adds LeetCode time per problem ([PRB](../../specs/v1/01-problems.md), proposed). It needs **no new permission** and no content script: the problem slug is read from the path of the active tab URL, which the extension already reads with `tabs`. Only the slug of a `leetcode.com/problems/<slug>/…` path is kept, validated with a strict pattern, and only when the account turns the feature on (PRB-05, PRB-06, SEC-01 exception). The rest of the URL is still read in memory and dropped. Permissions stay exactly SEC-03.
