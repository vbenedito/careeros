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
