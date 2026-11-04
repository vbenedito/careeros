# ADR-0005 — Audible tab counts as activity, with a 15-minute ceiling

Status: Accepted · Date: 2026-11-04

## Context
`chrome.idle` reports idle after N seconds without OS input. Watching a lecture produces no input, so a pure 60 s rule would record ~1 minute for a 40-minute video on a study site.

## Options
1. Pure idle rule — simple, undercounts video study badly.
2. Audible eligible tab = active, no limit — overcounts videos left playing.
3. **Audible = active up to 15 min without input**, then pause until input.
4. Read video playback state via content scripts — accurate, but needs content scripts and broad host permissions (privacy cost).

## Decision
Option 3. `Tab.audible` is a boolean exposed by the tabs API; no page content is read. Ceiling checked each heartbeat with `chrome.idle.queryState(900)`.

## Consequences
+ Lectures count; abandoned videos credit at most ~15 min.
− A focused video watched > 15 min without touching input pauses once (any input resumes).
− Silent videos (muted) are treated as idle.
