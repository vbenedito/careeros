# ADR-0012 — Server-owned plans and limits with a compatible error contract

Status: Proposed · Date: 2026-11-17 · Issue: #176 · Implementation: #177 (database), #180 (extension), #181 (web)

## Context
- The 12-site limit (DATA-01) is a literal in `private.enforce_tracked_domain_limit()`. The shared constant `DATA.MAX_TRACKED_DOMAINS` only drives messages, and the landing copy types "12" by hand. The 50 → 12 change (#145) needed a function rewrite and edits in several places (grill A1).
- Both clients find the limit error by `hint === "DATA-01"`; the error carries no number and no plan (grill A2).
- Released extension **0.2.3** maps `hint === "DATA-01"` to `LIMIT_REACHED` and must keep working.
- v1 builds only the foundation (D24): a `free` plan, nothing paid. Everything in v0 stays free (D22). A paid plan through a merchant of record may come at the end of v1 (D23); its feature and price are not decided.
- Spec: [ENT](../../specs/v1/02-entitlements.md).

## Options
1. **Keep literals, add a parity test.** Cheap; the trigger still needs a rewrite per change and nothing models a plan.
2. **A plans table read by the trigger; plan per account by a private function.** One row per plan, one column per limit. The trigger and the error read the same row.
3. **Limits in JWT claims** (custom access-token hook). No extra query, but limits change only when a token is refreshed, the hook is another moving part, and the database still needs the number for enforcement.
4. **Limits in app config (env or code), passed to the database.** The database is the place that enforces; config outside it can drift and can be bypassed through PostgREST.

## Decision
Option 2.

- **Where plans and limits live:** a table `public.plans (id text primary key, max_tracked_domains integer not null)`, readable by `authenticated`, written only by migrations. v1 has one row, `free` = 12 (ENT-01).
- **Which plan an account has:** `private.plan_of(user_id) → text`, which returns `'free'` in v1 (ENT-02). No per-account plan table yet.
- **Enforcement:** the DATA-01 trigger reads `max_tracked_domains` of `plan_of(new.user_id)` (ENT-03). Same lock, same error code.
- **Error contract (ENT-05, ENT-06):** `errcode P0001`, `hint 'DATA-01'`, the same message format, and a JSON `detail` `{"code":"LIMIT_REACHED","limit":12,"plan":"free"}`. PostgREST returns `detail` as `details`, so the change is additive.
- **How clients read it (ENT-07, ENT-08):** the hint stays the stable key. New clients parse `details` with a shared Zod schema; when it is missing or invalid they still report `LIMIT_REACHED`, with a message without a number. The dashboard API passes `limit` and `plan` on in its `422` reply. v1 has no RPC to read entitlements: no client needs one (D24). A later option is a `get_entitlements()` RPC, for screens that want to show the plan and its limits before an error happens.
- **Copy:** the landing page and messages take numbers from `ENTITLEMENTS` in `packages/shared` (ENT-10); a parity test keeps it equal to the last migration that sets the `free` row (ENT-11).

## Consequences
+ A limit change is one migration row; the trigger, the RPC and the error follow.
+ Released extension 0.2.3 is unaffected: same hint, same code, same status.
+ Clients can show the real number of the user's plan once plans differ.
− One more table and two functions to secure and test (RLS on `plans`: read only; grants; pgTAP).
− The landing page is static: it shows the `free` numbers from the shared constants, so a limit change still needs a site deploy (guarded by the parity test).

**How premium plugs in later** (ENT-12, not in v1): add a row (e.g. `pro`) with its limits; add a per-account plan record (e.g. `account_plans(user_id, plan_id, valid_until)`), written only by the server from the payment provider's webhook; change `private.plan_of` to read it, falling back to `free`. Clients already show the number and plan from the error, so a new number needs no extension release; a new kind of limit (a new column) needs client work and a spec. The landing copy ("There's no paid plan") changes in the paid-track round.
