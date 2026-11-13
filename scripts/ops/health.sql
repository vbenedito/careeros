-- Daily production health check (ENV-13, grill H2): aggregate counts only. No ids, emails or
-- domains are selected, so nothing identifying can reach the job log or summary.
-- Run by scripts/ops/db-readonly.sh inside a READ ONLY transaction; the policy test
-- (scripts/ci/health-lib.test.ts) checks that this file stays read-only and aggregate-only.
-- `study_sessions.created_at` is the upload time (default now()), so these counts measure what
-- the extensions managed to sync, which is what a silent sync failure would stop.
begin;
set transaction read only;

select
  -- Uploaded intervals.
  (select count(*) from public.study_sessions
    where created_at >= now() - interval '24 hours') as sessions_24h,
  -- The seven days before the last 24 hours: the baseline.
  (select count(*) from public.study_sessions
    where created_at >= now() - interval '8 days'
      and created_at < now() - interval '24 hours') as sessions_prior_7d,
  -- Distinct users that uploaded.
  (select count(distinct user_id) from public.study_sessions
    where created_at >= now() - interval '24 hours') as users_24h,
  (select count(distinct user_id) from public.study_sessions
    where created_at >= now() - interval '7 days') as users_7d,
  (select count(distinct user_id) from public.study_sessions
    where created_at >= now() - interval '8 days'
      and created_at < now() - interval '24 hours') as users_prior_7d,
  -- Users active in the last 7 days with no upload in the last 24 hours.
  (select count(*) from (
      select user_id from public.study_sessions
      where created_at >= now() - interval '7 days'
      group by user_id
      having count(*) filter (where created_at >= now() - interval '24 hours') = 0
    ) silent) as users_silent_24h,
  (select count(*) from auth.users) as users_total,
  (select count(*) from auth.users
    where created_at >= now() - interval '24 hours') as signups_24h,
  -- Extension-link rate limit (AUTH-08; rows are pruned after an hour): requests in the last
  -- hour, and users at the limit of 5 per minute window (an abuse or bug signal, info only).
  (select count(*) from private.link_requests
    where created_at >= now() - interval '1 hour') as link_requests_1h,
  (select count(*) from (
      select user_id from private.link_requests
      where created_at >= now() - interval '1 hour'
      group by user_id
      having count(*) >= 5
    ) limited) as link_limited_users_1h;

rollback;
