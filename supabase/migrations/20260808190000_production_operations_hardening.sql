-- Production operations hardening for clinic team access and supportability.

create table public.team_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_agent_id uuid references public.agents(id) on delete set null,
  event_type text not null check (event_type in (
    'invitation_created','invitation_delivered','invitation_revoked',
    'member_role_changed','member_deactivated','member_reactivated'
  )),
  summary text not null check (char_length(trim(summary)) between 2 and 240),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index team_audit_events_org_time_idx
  on public.team_audit_events (organization_id, created_at desc);

alter table public.team_audit_events enable row level security;
grant select on public.team_audit_events to authenticated;

create policy "admins read team audit events"
on public.team_audit_events for select to authenticated
using (private.is_organization_member(organization_id, 'admin'));

create table public.operational_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_source text not null check (char_length(trim(event_source)) between 2 and 120),
  severity text not null default 'error' check (severity in ('warning','error','critical')),
  error_code text not null check (char_length(trim(error_code)) between 2 and 100),
  safe_message text not null check (char_length(trim(safe_message)) between 2 and 500),
  request_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index operational_events_org_time_idx
  on public.operational_events (organization_id, created_at desc);
create index operational_events_unresolved_idx
  on public.operational_events (severity, created_at desc)
  where resolved_at is null;

alter table public.operational_events enable row level security;
grant select on public.operational_events to authenticated;

create policy "admins read workspace operational events"
on public.operational_events for select to authenticated
using (
  organization_id is not null
  and private.is_organization_member(organization_id, 'admin')
);

create table private.api_rate_limits (
  actor_user_id uuid not null,
  bucket text not null,
  window_started_at timestamptz not null,
  hit_count integer not null default 1 check (hit_count > 0),
  updated_at timestamptz not null default now(),
  primary key (actor_user_id, bucket, window_started_at)
);

alter table private.api_rate_limits enable row level security;
revoke all on private.api_rate_limits from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  window_start timestamptz;
  current_hits integer;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if p_bucket not in ('team_invite','team_role_change','team_deactivate','team_reactivate')
    or p_limit < 1 or p_limit > 100
    or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit configuration';
  end if;

  window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.api_rate_limits (actor_user_id, bucket, window_started_at)
  values (actor, p_bucket, window_start)
  on conflict (actor_user_id, bucket, window_started_at)
  do update set hit_count = private.api_rate_limits.hit_count + 1, updated_at = now()
  returning hit_count into current_hits;

  return current_hits <= p_limit;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to authenticated;

-- A disabled human membership must no longer authorize any tenant data access.
create or replace function private.is_organization_member(
  target_organization_id uuid,
  minimum_role text default 'member'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.agents a
      where a.organization_id = target_organization_id
        and a.user_id = (select auth.uid())
        and coalesce(a.extra->>'status', 'active') = 'active'
        and case coalesce(a.extra->>'role', 'member')
          when 'owner' then 30
          when 'admin' then 20
          else 10
        end >= case minimum_role
          when 'owner' then 30
          when 'admin' then 20
          else 10
        end
    );
$$;

revoke all on function private.is_organization_member(uuid, text) from public, anon, authenticated;

create or replace function public.get_authorized_orgs(role role default 'member'::role)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  req_level int;
  api_key text;
  org_id uuid;
begin
  req_level := case role::text when 'owner' then 3 when 'admin' then 2 else 1 end;

  if (select auth.uid()) is not null then
    return query select organization_id from public.agents
    where user_id = (select auth.uid())
      and coalesce(extra->>'status', 'active') = 'active'
      and (extra->'invitation' is null or extra->'invitation'->>'status' = 'accepted')
      and case extra->>'role' when 'owner' then 3 when 'admin' then 2 else 1 end >= req_level;
    return;
  end if;

  api_key := current_setting('request.headers', true)::json->>'api-key';
  if api_key is not null then
    select a.organization_id into org_id from public.api_keys a
    where a.key = api_key
      and case a.role::text when 'owner' then 3 when 'admin' then 2 else 1 end >= req_level;
    if org_id is not null then return next org_id; end if;
    return;
  end if;

  raise exception using errcode = '42501', message = 'authentication required',
    hint = 'use api-key header or jwt authentication';
end;
$$;

revoke all on function public.get_authorized_orgs(role) from public;
grant execute on function public.get_authorized_orgs(role) to anon, authenticated, service_role;
