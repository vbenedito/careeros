# 02 — Entitlements (plans and limits)

Status: **Proposed (2026-11-17)** · Issue: #176 · Source: [v1 discovery](00-discovery.md) D22, D23, D24; [grill report](../../docs/history/grill-report-2026-11-12.md) A1, A2 · Related ADRs: [0012](../../docs/adr/0012-entitlements.md) (entitlements)

Amended 2026-11-27 (#285, PS-a): ENT-01 and ENT-05 implemented for problem rules in `20261127200000_problem_rules.sql`: new column `plans.max_problem_rules` (`free` = 5, `FREE_MAX_PROBLEM_RULES`, checked by `db-parity.test.ts`, ENT-11); the cap error of a new rule has `hint` = `PSR-15` and `details.kind = "problem_rules"` ([PSR-15](05-problem-sites.md)). The site limit (DATA-01) is unchanged.

Amended 2026-11-18 (#180): ENT-07 and ENT-09 implemented in the extension: the site-limit error reads `limit` from `details` (`parseLimitErrorDetails`); the popup message uses it. With no valid details the hint still gives `LIMIT_REACHED` and the message is "You've reached the site limit." (EXT-UI-07).

## 1. Objective

Give every business limit **one owner**: the server. Today the 12-site limit is a number inside a SQL function, a shared constant only drives messages, and the landing page types "12" by hand (grill A1). Both clients find the limit error by a hard-coded `hint === "DATA-01"` (grill A2).

v1 adds the **foundation** only (D24): a plans concept with a single `free` plan, one source for limits, an error that carries the limit and the plan, and copy built from constants. Nothing changes for users: the free plan keeps every v0 limit, and everything in v0 stays free (D22). Paid plans come later (D23, paid-track round).

## 2. Constants

| Name | Value | Notes |
|---|---|---|
| `PLAN_FREE` | `free` | The only plan in v1; every account is on it |
| `FREE_MAX_TRACKED_DOMAINS` | 12 | Same value as DATA-01 today |
| `LIMIT_ERROR_CODE` | `LIMIT_REACHED` | Stable code in the error details and in the dashboard API |
| `LIMIT_ERROR_HINT` | `DATA-01` | Kept for released extensions (ENT-06) |

Mirrored in `packages/shared` (`ENTITLEMENTS`); the database is the authority at run time.

## 3. Requirements

**Plans and limits**

- **ENT-01** The database holds a **plans** table with one row per plan and one column per limit. v1 has exactly one row: `free` with `max_tracked_domains = 12`. Clients can read it but not change it; only a migration changes it.
- **ENT-02** Every account is on a plan. In v1 there is no per-account plan record: the plan of every account is `free`. One private function returns the plan of a user (`private.plan_of(user_id)`), so a later per-account plan changes only that function.
- **ENT-03** The tracked-site limit (DATA-01) reads its number from the caller's plan (ENT-01, ENT-02), not from a literal in the trigger. Changing a limit is a one-row migration; no function is rewritten.
- *ENT-04 — removed 2026-11-17 (review of #194): no RPC to read entitlements in v1; no client needs one (D24). ADR-0012 keeps it as a later option.*

**Error contract**

- **ENT-05** When a limit is reached, the database raises an error with:
  - `errcode` `P0001` (unchanged);
  - `hint` = the spec ID of the limit (`DATA-01` for tracked sites, unchanged);
  - `message` in the same format as today (`A user can track at most 12 domains`), with the plan's number;
  - `detail` = a JSON object `{"code":"LIMIT_REACHED","limit":12,"plan":"free"}` (PostgREST returns it as `details`).
- **ENT-06** **Compatibility:** released extension 0.2.3 maps `hint === "DATA-01"` to `LIMIT_REACHED`. The hint, the error code and the HTTP status stay the same, so 0.2.3 keeps working without an update. New fields are only added in `detail`.
- **ENT-07** New clients read the limit and the plan from `details` with a schema in `packages/shared`. When `details` is missing or invalid (an older database, a proxy), they still report `LIMIT_REACHED` (from the hint) and show a message **without** a number. They never take the number from the shared constant at run time.
- **ENT-08** The dashboard API `POST /api/sites` answers a limit error with `422 {"error":"LIMIT_REACHED","limit":12,"plan":"free"}` (`limit` and `plan` only when known, ENT-07). The other DASH-12 rules stay (re-adding a tracked site at the limit succeeds).
- **ENT-09** The messages say the number from the error: dashboard and popup show "You can track up to 12 sites." The text does not mention a paid plan in v1.

**Copy and parity**

- **ENT-10** The landing page builds every limit number from the shared constants (`ENTITLEMENTS`) (LAND-03 content: "the rules in numbers" and the FAQ). Check: the landing content file (`apps/web/lib/landing/content.ts`) contains no literal `12` for the site limit; a test fails when it does.
- **ENT-11** A **parity test** fails when the free plan's limits in the migrations and the shared constants differ. It reads the last migration that sets the `free` row (as `db-parity.test.ts` reads the domain type). A pgTAP test checks that the trigger refuses an insert at the number in the `free` row.
- **ENT-12** Premium later plugs in by: a new row in plans, a per-account plan record read by `private.plan_of`, and new limit columns. No client release is needed to change a number; a new limit kind needs one (ADR-0012).

## 4. Acceptance criteria

1. With 12 sites, adding a 13th from the dashboard returns `422` with `limit` 12 and plan `free`; from the popup, the error says "up to 12 sites".
2. Released extension 0.2.3 (its `toError` mapping, run against the new database in a compatibility test) still reports `LIMIT_REACHED`.
3. Changing the `free` row in a test database changes the trigger's limit and the error's `limit` with no other change.
4. The parity test fails when the shared constant and the migration differ; the landing test fails on a literal "12".
5. Users see no change: same limit, same messages apart from the number now coming from the server.
