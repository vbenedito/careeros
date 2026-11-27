-- #241 (NC-e): contract step of expand -> deploy -> contract for the per-site problem totals.
-- Spec: DATA-15 (removed), DATA-15a (public.get_problem_totals_v2 replaces it), PRB-16, PRB-18..22;
-- specs/v1/01-problems.md sections 5 and 6.
--
-- Why this is safe: since 2026-11-20 the dashboard (apps/web/lib/problems/data.ts) calls only
-- get_problem_totals_v2, the extension never called get_problem_totals, and the tech lead decided
-- that the dashboard rollback window has passed. Nothing else changes in the database.

drop function public.get_problem_totals(date, date, text);
