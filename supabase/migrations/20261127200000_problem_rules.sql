-- User problem rules, expand step (#285, PS-a of #245).
-- Spec: specs/v1/05-problem-sites.md PSR-01..09, PSR-13, PSR-15, PSR-16, PSR-22..25 and section 6
-- step 1; specs/v1/02-entitlements.md ENT-01, ENT-03, ENT-05; specs/v0/04-data-model.md DATA-06b,
-- DATA-12, DATA-16; ADR-0015; docs/process/release.md.
--
-- Only widens (expand -> deploy -> contract). Extensions 0.2.3, 0.3.0 and 0.3.1 and the deployed
-- dashboard send ids only on the built-in domains (leetcode.com, neetcode.io), which stay valid
-- with the same slug rules; nothing they call changes shape (PRB-20).
--   1. plans.max_problem_rules (5 on free, O4).
--   2. problem_rules (PSR-22): one table of rules per account, read-only for clients; the add and
--      remove RPCs are the only write path. A removed rule is a tombstone (no prefix, no label).
--   3. The stored-id check widens from the slug pattern to the id pattern (a widening: every
--      stored slug fits), and the literal domain CHECK on study_session_problems becomes a
--      trigger with the same SQLSTATE (23514), so a direct insert is still refused (PSR-24).
--   4. The ingest v2 parser checks an id against the built-in rules plus the caller's own rules
--      (PSR-23). private.ingest_sessions and both public ingest RPCs are not changed.
--   5. Per-domain history delete (PSR-13).

-- ---------------------------------------------------------------------------------------------
-- ENT-01, PSR-15: the cap on user rules is a column of plans. Added nullable, filled, then made
-- NOT NULL, so a future plan row without a limit fails closed (the add RPC raises ENT-03).
-- ---------------------------------------------------------------------------------------------
alter table public.plans add column max_problem_rules integer check (max_problem_rules > 0);
update public.plans set max_problem_rules = 5 where id = 'free';
alter table public.plans alter column max_problem_rules set not null;

-- ---------------------------------------------------------------------------------------------
-- PSR-22: problem_rules.
-- `domain` has no FK to tracked_domains: a removed site must not delete the rule (PSR-05).
-- Active row: prefix and label set, removed_at null. Tombstone: removed_at set, prefix and label
-- null (the parts that can name a person are gone as soon as the user removes the rule).
-- ---------------------------------------------------------------------------------------------
create table public.problem_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  domain public.hostname not null,
  prefix text[],
  kind text not null,
  label text,
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  -- PROBLEM_ID_KINDS (specs/v1/05-problem-sites.md section 2)
  constraint problem_rules_kind_check check (kind in ('slug', 'id')),
  -- PSR-22: an active rule has a prefix and a label; a tombstone has neither.
  constraint problem_rules_state_check check (
    (removed_at is null and prefix is not null and label is not null)
    or (removed_at is not null and prefix is null and label is null)
  ),
  -- PROBLEM_RULE_PREFIX_MIN / _MAX (1..3 segments). Slash count = segments - 1 also refuses an
  -- element that itself contains '/' and an element that is null (array_to_string skips nulls).
  constraint problem_rules_prefix_count_check check (
    prefix is null or (
      array_ndims(prefix) = 1
      and cardinality(prefix) between 1 and 3
      and char_length(array_to_string(prefix, '/'))
          - char_length(replace(array_to_string(prefix, '/'), '/', '')) = cardinality(prefix) - 1
    )
  ),
  -- PROBLEM_RULE_SEGMENT_PATTERN for each segment, joined with '/' (db-parity.test.ts keeps the
  -- pattern equal to packages/shared).
  constraint problem_rules_prefix_pattern_check check (
    prefix is null
    or array_to_string(prefix, '/')
       ~ '^[a-z0-9]+(?:[-_.][a-z0-9]+)*(?:/[a-z0-9]+(?:[-_.][a-z0-9]+)*){0,2}$'
  ),
  -- PROBLEM_RULE_SEGMENT_MAX (40): a run of 41 characters without '/' is a segment that is too long.
  constraint problem_rules_prefix_length_check check (
    prefix is null or array_to_string(prefix, '/') !~ '[^/]{41}'
  ),
  -- PROBLEM_RULE_LABEL_MAX (40)
  constraint problem_rules_label_check check (
    label is null or char_length(label) between 1 and 40
  )
);

comment on table public.problem_rules is
  'Problem rules of an account (PSR-22): domain + literal path prefix + id kind + label. '
  'A removed rule is a tombstone (removed_at set, prefix and label null). Written only by '
  'add_problem_rule, remove_problem_rule and delete_problem_history.';

-- PSR-09, PSR-22: no duplicate prefix among the caller's ACTIVE rules on a domain.
create unique index problem_rules_active_key
  on public.problem_rules (user_id, domain, prefix) where removed_at is null;
-- Ingest and history lookups by (user, domain), active or removed; also the FK cascade.
create index problem_rules_user_domain_idx on public.problem_rules (user_id, domain);

alter table public.problem_rules enable row level security;
alter table public.problem_rules force row level security;

-- PSR-16: clients have no INSERT, UPDATE or DELETE privilege.
revoke all on table public.problem_rules from anon, authenticated;
grant select on table public.problem_rules to authenticated;

-- A client sees its own ACTIVE rules only: a tombstone is "not sent to the extension and not
-- shown" (PSR-22), so it is not readable at all.
create policy problem_rules_select_own on public.problem_rules
  for select to authenticated
  using (user_id = (select auth.uid()) and removed_at is null);

create policy problem_rules_no_anonymous on public.problem_rules
  as restrictive
  for all to authenticated
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

-- ---------------------------------------------------------------------------------------------
-- PSR-15, ENT-03: the cap is enforced in the insert path, as for DATA-01. Only active rows exist
-- at insert time (a tombstone is made by an update), so the count is the active rules. Lists that
-- are over the limit (a later, lower limit) are kept: the trigger runs on insert only.
-- Error: errcode P0001, hint PSR-15 (a new rule has no released client that reads DATA-01),
-- detail {"code","limit","plan","kind"}.
-- ---------------------------------------------------------------------------------------------
create function private.enforce_problem_rule_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_limit integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('problem_rules:' || new.user_id::text, 0));

  v_plan := private.plan_of(new.user_id);
  select p.max_problem_rules into v_limit from public.plans p where p.id = v_plan;
  if v_limit is null then
    -- Fail closed: a plan without a row must never mean "no limit".
    raise exception 'Plan % has no limit row', v_plan using errcode = 'P0001', hint = 'ENT-03';
  end if;

  if (select count(*) from public.problem_rules
      where user_id = new.user_id and removed_at is null) >= v_limit then
    raise exception 'A user can add at most % problem rules', v_limit
      using errcode = 'P0001',
            hint = 'PSR-15',
            detail = jsonb_build_object(
              'code', 'LIMIT_REACHED', 'limit', v_limit, 'plan', v_plan, 'kind', 'problem_rules'
            )::text;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_problem_rule_limit() from public, anon, authenticated;

create trigger problem_rules_limit
  before insert on public.problem_rules
  for each row execute function private.enforce_problem_rule_limit();

-- ---------------------------------------------------------------------------------------------
-- PSR-16, PSR-25, PSR-09: add a rule. The only insert path. SECURITY DEFINER because clients
-- have no INSERT privilege. Same per-user lock as ingest (DATA-09), so an add is ordered with
-- uploads and two parallel adds cannot both pass a check.
-- Checks, in this order: caller; arguments; PSR-25 confirmation; domain (hostname type, TRK-03);
-- tracked by the caller (exact); no built-in rule on it (PSR-04); prefix; kind; label; duplicate
-- among active rules; cap (trigger). Refusals are 22023 with a stable code in the message.
-- Returns the id of the new rule.
-- ---------------------------------------------------------------------------------------------
create function public.add_problem_rule(
  p_domain text,
  p_prefix text[],
  p_kind text,
  p_label text,
  p_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  v_domain public.hostname;
  v_label text;
  v_segment text;
  v_id uuid;
begin
  if caller is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  if p_domain is null or p_prefix is null or p_kind is null then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023',
      detail = 'p_domain, p_prefix and p_kind are required';
  end if;

  -- PSR-25: the user must confirm that the id names a problem (stored as confirmed_at).
  if p_confirmed is distinct from true then
    raise exception 'CONFIRMATION_REQUIRED' using errcode = '22023', hint = 'PSR-25',
      detail = 'confirmedProblemId must be true';
  end if;

  -- TRK-03: the domain must be a normalized hostname (no www., lower case, no IP, no port).
  begin
    v_domain := p_domain::public.hostname;
  exception when others then
    raise exception 'INVALID_DOMAIN' using errcode = '22023', hint = 'PSR-05';
  end;

  perform pg_advisory_xact_lock(hashtextextended('ingest_study_sessions:' || caller::text, 0));

  -- PSR-05, PSR-16: exact match on one of the caller's tracked domains (TRK-03). A lookalike
  -- (hellointerview.com.evil.com, nothellointerview.com, hellointerview.co) is not the tracked
  -- domain and is refused.
  if not exists (
    select 1 from public.tracked_domains t where t.user_id = caller and t.domain = v_domain
  ) then
    raise exception 'DOMAIN_NOT_TRACKED' using errcode = '22023', hint = 'PSR-05';
  end if;

  -- PSR-04, O5: a domain with a built-in rule takes no user rule in this version.
  if v_domain::text = any (private.problem_domains()) then
    raise exception 'BUILT_IN_DOMAIN' using errcode = '22023', hint = 'PSR-04';
  end if;

  -- PSR-06: 1..3 literal segments, each lower case, at most 40 characters. The same checks
  -- are table CHECKs (defence in depth).
  if array_ndims(p_prefix) is distinct from 1 or cardinality(p_prefix) not between 1 and 3 then
    raise exception 'INVALID_PREFIX' using errcode = '22023', hint = 'PSR-06',
      detail = '1 to 3 segments';
  end if;
  foreach v_segment in array p_prefix loop
    if v_segment is null
       or char_length(v_segment) > 40                                    -- PROBLEM_RULE_SEGMENT_MAX
       or v_segment !~ '^[a-z0-9]+(?:[-_.][a-z0-9]+)*$' then            -- PROBLEM_RULE_SEGMENT_PATTERN
      raise exception 'INVALID_PREFIX' using errcode = '22023', hint = 'PSR-06',
        detail = 'segments are lower case letters, digits and - _ .';
    end if;
  end loop;

  -- PSR-07: a fixed list of id kinds; a rule never carries its own pattern.
  if p_kind not in ('slug', 'id') then                                   -- PROBLEM_ID_KINDS
    raise exception 'INVALID_KIND' using errcode = '22023', hint = 'PSR-07';
  end if;

  -- PSR-01: the label the user types; default: the domain.
  v_label := nullif(btrim(coalesce(p_label, '')), '');
  if v_label is null then
    v_label := v_domain::text;
  end if;
  if char_length(v_label) > 40 then                                      -- PROBLEM_RULE_LABEL_MAX
    raise exception 'INVALID_LABEL' using errcode = '22023', hint = 'PSR-01';
  end if;

  -- PSR-09: only active rules count for duplicates (the unique index repeats this).
  if exists (
    select 1 from public.problem_rules r
    where r.user_id = caller and r.domain = v_domain and r.removed_at is null and r.prefix = p_prefix
  ) then
    raise exception 'DUPLICATE_RULE' using errcode = '23505', hint = 'PSR-09';
  end if;

  -- PSR-22: an active rule on the domain covers it, so the tombstones of the domain go.
  delete from public.problem_rules r
  where r.user_id = caller and r.domain = v_domain and r.removed_at is not null;

  -- PSR-15: the cap is checked by the BEFORE INSERT trigger problem_rules_limit.
  insert into public.problem_rules (user_id, domain, prefix, kind, label, confirmed_at)
  values (caller, v_domain, p_prefix, p_kind, v_label, now())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.add_problem_rule(text, text[], text, text, boolean) from public, anon;
grant execute on function public.add_problem_rule(text, text[], text, text, boolean) to authenticated;

comment on function public.add_problem_rule(text, text[], text, text, boolean) is
  'Adds a problem rule for auth.uid() after the checks of PSR-05..09, PSR-15, PSR-16 and PSR-25; '
  'returns the rule id. Refusals: 22023 (message = stable code), 23505 DUPLICATE_RULE, '
  'P0001 LIMIT_REACHED (hint PSR-15).';

-- ---------------------------------------------------------------------------------------------
-- PSR-13, PSR-22, PSR-24: per-domain history delete. Deletes the stored ids of ONE domain of the
-- caller; the tombstones of that domain stay (they hold no prefix and no label, and they keep
-- queued intervals from being rejected, PRB-07). study_sessions and every total stay unchanged.
-- Same per-user lock as ingest, so no upload in flight can add an id after the delete.
-- Private helper so remove_problem_rule and delete_problem_history share one implementation.
-- ---------------------------------------------------------------------------------------------
create function private.delete_problem_domain_history(p_user_id uuid, p_domain public.hostname)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.study_session_problems p
  where p.user_id = p_user_id and p.domain = p_domain;
$$;

revoke all on function private.delete_problem_domain_history(uuid, public.hostname)
  from public, anon, authenticated;

create function public.delete_problem_history(p_domain text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  v_domain public.hostname;
begin
  if caller is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  if p_domain is null then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023', detail = 'p_domain is required';
  end if;
  begin
    v_domain := p_domain::public.hostname;
  exception when others then
    raise exception 'INVALID_DOMAIN' using errcode = '22023', hint = 'PSR-05';
  end;

  perform pg_advisory_xact_lock(hashtextextended('ingest_study_sessions:' || caller::text, 0));
  perform private.delete_problem_domain_history(caller, v_domain);
end;
$$;

revoke all on function public.delete_problem_history(text) from public, anon;
grant execute on function public.delete_problem_history(text) to authenticated;

comment on function public.delete_problem_history(text) is
  'Deletes the stored problem ids of one domain of auth.uid(); keeps that domain''s tombstones; '
  'never touches study_sessions or any total (PSR-13, PSR-24).';

-- ---------------------------------------------------------------------------------------------
-- PSR-13, PSR-22: remove an active rule of the caller.
--   keep history   -> the row becomes a tombstone: removed_at set, prefix and label cleared now.
--   delete history -> the stored ids of that domain are deleted, then the rule becomes a
--                     tombstone as well, so an interval still queued in the extension keeps its
--                     time with the id dropped (PSR-23 step 4, PRB-07).
-- Same per-user lock as ingest. A rule that is not the caller's or is already removed is
-- PT404 NOT_FOUND (a client cannot tell the two apart).
-- ---------------------------------------------------------------------------------------------
create function public.remove_problem_rule(p_rule_id uuid, p_delete_history boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  v_domain public.hostname;
begin
  if caller is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  if p_rule_id is null or p_delete_history is null then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023',
      detail = 'p_rule_id and p_delete_history are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ingest_study_sessions:' || caller::text, 0));

  select r.domain into v_domain
  from public.problem_rules r
  where r.id = p_rule_id and r.user_id = caller and r.removed_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'PT404';
  end if;

  if p_delete_history then
    perform private.delete_problem_domain_history(caller, v_domain);
  end if;
  update public.problem_rules r
  set removed_at = now(), prefix = null, label = null
  where r.id = p_rule_id and r.user_id = caller;
end;
$$;

revoke all on function public.remove_problem_rule(uuid, boolean) from public, anon;
grant execute on function public.remove_problem_rule(uuid, boolean) to authenticated;

comment on function public.remove_problem_rule(uuid, boolean) is
  'Removes an active problem rule of auth.uid(): keep history leaves a tombstone (no prefix, no '
  'label); delete history first deletes the stored ids of that domain. Both leave a tombstone '
  '(PSR-13, PSR-22, PSR-23 step 4).';

-- ---------------------------------------------------------------------------------------------
-- PSR-24, DATA-16: widen the stored-id check from the slug pattern to the id pattern. Every
-- stored slug fits (a slug is an id). The kind-specific pattern and length are checked by the
-- trigger below and by the parser; this is the outer bound for every row.
-- ---------------------------------------------------------------------------------------------
set local lock_timeout = '5s';
alter table public.study_session_problems
  drop constraint study_session_problems_slug_check;
alter table public.study_session_problems
  add constraint study_session_problems_slug_check check (
    char_length(problem_slug) <= 100                                 -- PROBLEM_SLUG_MAX
    and problem_slug ~ '^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$'         -- PROBLEM_ID_PATTERN
  );

-- ---------------------------------------------------------------------------------------------
-- PSR-24: the literal domain check becomes a trigger with the same SQLSTATE (23514), so a direct
-- insert outside the RPC is still refused. The same rule as PSR-23 steps 2, 3 and 5 for the
-- row's user:
--   - a built-in domain (private.problem_domains()) needs a slug (PROBLEM_SLUG_PATTERN, <= 100);
--   - another domain needs an active rule of that user and an id of PROBLEM_ID_PATTERN, <= 64;
--   - no rule of that user at all: refused.
-- Step 4 of PSR-23 (only a removed rule) is "store the time, drop the id" in the parser, so the
-- ingest path never inserts here. A direct insert for a domain with only a tombstone is accepted
-- with the same id checks: "Remove and keep history" keeps those rows, and a restore from the
-- backup must be able to load them back (PSR-22). Every row that was allowed before stays
-- allowed: the built-in rules give the same result as the old list.
-- ---------------------------------------------------------------------------------------------
create function private.check_problem_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_rule boolean;
begin
  if new.domain::text = any (private.problem_domains()) then
    if char_length(new.problem_slug) > 100                           -- PROBLEM_SLUG_MAX
       or new.problem_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then      -- PROBLEM_SLUG_PATTERN
      raise exception 'study_session_problems: a built-in problem site needs a slug'
        using errcode = '23514', hint = 'PSR-24',
              table = 'study_session_problems', constraint = 'study_session_problems_rule_check';
    end if;
    return new;
  end if;

  select exists (
    select 1 from public.problem_rules r where r.user_id = new.user_id and r.domain = new.domain
  ) into v_has_rule;
  if not v_has_rule
     or char_length(new.problem_slug) > 64                           -- PROBLEM_ID_MAX
     or new.problem_slug !~ '^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$' then -- PROBLEM_ID_PATTERN
    raise exception 'study_session_problems: the domain has no problem rule of this user'
      using errcode = '23514', hint = 'PSR-24',
            table = 'study_session_problems', constraint = 'study_session_problems_rule_check';
  end if;
  return new;
end;
$$;

revoke all on function private.check_problem_row() from public, anon, authenticated;

alter table public.study_session_problems
  drop constraint study_session_problems_domain_check;

create trigger study_session_problems_rule_check
  before insert on public.study_session_problems
  for each row execute function private.check_problem_row();

-- ---------------------------------------------------------------------------------------------
-- DATA-06b, PSR-23: the v2 element parser, same body as 20261120100000 except for the problem
-- block. Order of the checks for an element with a `problem` (the setting is read later, by
-- private.ingest_sessions, DATA-14; step 1 is unchanged):
--   2. built-in domain: PROBLEM_SLUG_PATTERN and PROBLEM_SLUG_MAX, else the element is invalid;
--   3. the caller has an ACTIVE rule on the domain: PROBLEM_ID_PATTERN and PROBLEM_ID_MAX, else
--      invalid;
--   4. only a REMOVED rule of the caller: the interval is valid and the id is dropped;
--   5. no rule of the caller (another user's site, neetcode.io.evil.com): invalid, as before.
-- The server never sees the path, so it cannot check the prefix (the extension does).
-- Signature and out parameters are unchanged: private.ingest_sessions needs no change.
-- ---------------------------------------------------------------------------------------------
create or replace function private.parse_session_element(
  element jsonb,
  with_problem boolean,
  out id uuid,
  out device_id uuid,
  out domain public.hostname,
  out started_at timestamptz,
  out ended_at timestamptz,
  out problem text,
  out reason text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  -- TRK-10: UTC ISO-8601 with whole seconds, e.g. 2026-11-05T09:30:00Z
  iso_seconds constant text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$';
  v_domain text;
  v_active boolean;
  v_removed boolean;
begin
  reason := 'invalid';

  if jsonb_typeof(element) is distinct from 'object'
     or jsonb_typeof(element -> 'id') is distinct from 'string' then
    return;
  end if;
  begin
    id := (element ->> 'id')::uuid;
  exception when others then
    id := null;                                                -- not a UUID: unnamed rejection
    return;
  end;

  if jsonb_typeof(element -> 'device_id') is distinct from 'string'
     or jsonb_typeof(element -> 'domain') is distinct from 'string'
     or jsonb_typeof(element -> 'started_at') is distinct from 'string'
     or jsonb_typeof(element -> 'ended_at') is distinct from 'string'
     or (element ->> 'started_at') !~ iso_seconds
     or (element ->> 'ended_at') !~ iso_seconds then
    return;
  end if;

  begin
    device_id := (element ->> 'device_id')::uuid;
    domain := (element ->> 'domain')::public.hostname;         -- TRK-03 rules (domain type)
    started_at := (element ->> 'started_at')::timestamptz;
    ended_at := (element ->> 'ended_at')::timestamptz;
  exception when others then
    return;                                                    -- e.g. 2026-13-45, bad UUID
  end;

  if ended_at <= started_at                                    -- DATA-02
     or ended_at - started_at > interval '1830 seconds'        -- DATA-02
     or started_at < now() - interval '30 days' then           -- DATA-07
    return;
  end if;

  -- DATA-06b, PSR-23: the id is checked as stored, never changed to make it valid.
  if with_problem and (element ? 'problem') and jsonb_typeof(element -> 'problem') <> 'null' then
    if jsonb_typeof(element -> 'problem') <> 'string' then
      return;
    end if;
    v_domain := domain::text;
    if v_domain = any (private.problem_domains()) then          -- step 2: built-in rule
      if char_length(element ->> 'problem') > 100               -- PROBLEM_SLUG_MAX
         or (element ->> 'problem') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then  -- PROBLEM_SLUG_PATTERN
        return;
      end if;
      problem := element ->> 'problem';
    else
      -- Only the caller's own rules count, never a global list of user domains (PSR-23).
      select coalesce(bool_or(r.removed_at is null), false), count(*) > 0
      into v_active, v_removed
      from public.problem_rules r
      where r.user_id = (select auth.uid()) and r.domain::text = v_domain;
      if v_active then                                          -- step 3: active rule
        if char_length(element ->> 'problem') > 64              -- PROBLEM_ID_MAX
           or (element ->> 'problem') !~ '^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$' then  -- PROBLEM_ID_PATTERN
          return;
        end if;
        problem := element ->> 'problem';
      elsif v_removed then                                      -- step 4: only a removed rule
        problem := null;                                        -- the time is stored, the id dropped
      else                                                      -- step 5: no rule of the caller
        return;
      end if;
    end if;
  end if;

  if ended_at > now() + interval '5 minutes' then              -- DATA-07
    reason := 'future';
    return;
  end if;

  reason := null;
end;
$$;

revoke all on function private.parse_session_element(jsonb, boolean) from public, anon, authenticated;
