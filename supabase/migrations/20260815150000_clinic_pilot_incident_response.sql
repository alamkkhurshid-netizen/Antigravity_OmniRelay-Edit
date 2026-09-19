-- Tenant-scoped clinic pilot incident lifecycle. Descriptions must remain free of patient content.

create table public.security_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text not null default ('INC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))) unique,
  severity text not null check (severity in ('low','medium','high','critical')),
  category text not null check (category in ('unauthorized_access','data_exposure','credential_compromise','service_outage','provider_failure','suspicious_activity','other')),
  status text not null default 'open' check (status in ('open','contained','monitoring','resolved','closed')),
  title text not null check (char_length(trim(title)) between 5 and 160),
  safe_summary text not null check (char_length(trim(safe_summary)) between 5 and 1000),
  owner_user_id uuid references auth.users(id) on delete set null,
  containment_summary text check (containment_summary is null or char_length(trim(containment_summary)) between 5 and 1000),
  resolution_summary text check (resolution_summary is null or char_length(trim(resolution_summary)) between 5 and 1000),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  contained_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('resolved','closed') or resolution_summary is not null),
  check (status <> 'closed' or closed_at is not null)
);

create index security_incidents_org_status_idx on public.security_incidents (organization_id, status, severity, created_at desc);
alter table public.security_incidents enable row level security;
revoke all on public.security_incidents from public, anon;
grant select, insert, update on public.security_incidents to authenticated;

create policy "admins read security incidents" on public.security_incidents for select to authenticated
using (private.is_organization_member(organization_id, 'admin'));
create policy "admins create security incidents" on public.security_incidents for insert to authenticated
with check (private.is_organization_member(organization_id, 'admin') and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "admins update security incidents" on public.security_incidents for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin') and updated_by = (select auth.uid()));

create table public.security_incident_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_id uuid not null references public.security_incidents(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('created','status_changed','ownership_changed','details_updated')),
  from_status text,
  to_status text,
  safe_summary text not null check (char_length(trim(safe_summary)) between 2 and 500),
  created_at timestamptz not null default now()
);

create index security_incident_events_incident_time_idx on public.security_incident_events (incident_id, created_at desc);
alter table public.security_incident_events enable row level security;
revoke all on public.security_incident_events from public, anon, authenticated;
grant select on public.security_incident_events to authenticated;
create policy "admins read security incident history" on public.security_incident_events for select to authenticated
using (private.is_organization_member(organization_id, 'admin'));

create or replace function private.audit_security_incident_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_kind text; event_summary text;
begin
  if tg_op = 'INSERT' then event_kind := 'created'; event_summary := 'Incident opened with severity ' || new.severity || '.';
  elsif old.status is distinct from new.status then event_kind := 'status_changed'; event_summary := 'Incident status changed from ' || old.status || ' to ' || new.status || '.';
  elsif old.owner_user_id is distinct from new.owner_user_id then event_kind := 'ownership_changed'; event_summary := 'Incident ownership changed.';
  else event_kind := 'details_updated'; event_summary := 'Incident details updated.'; end if;
  insert into public.security_incident_events (organization_id, incident_id, actor_user_id, event_type, from_status, to_status, safe_summary)
  values (new.organization_id, new.id, new.updated_by, event_kind, case when tg_op = 'UPDATE' then old.status else null end, new.status, event_summary);
  return new;
end;
$$;
revoke all on function private.audit_security_incident_change() from public, anon, authenticated;
create trigger audit_security_incident_change after insert or update on public.security_incidents
for each row execute function private.audit_security_incident_change();

create or replace function private.prepare_security_incident_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.reference is distinct from old.reference
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'immutable incident identity';
  end if;
  if new.owner_user_id is not null and not exists (
    select 1 from public.agents a
    where a.organization_id = new.organization_id
      and a.user_id = new.owner_user_id
      and coalesce(a.extra->>'status', 'active') = 'active'
  ) then
    raise exception 'incident owner must be an active organization member';
  end if;
  new.updated_at := now();
  if new.status = 'contained' and old.status is distinct from new.status then new.contained_at := coalesce(new.contained_at, now()); end if;
  if new.status = 'resolved' and old.status is distinct from new.status then new.resolved_at := coalesce(new.resolved_at, now()); end if;
  if new.status = 'closed' and old.status is distinct from new.status then new.resolved_at := coalesce(new.resolved_at, now()); new.closed_at := coalesce(new.closed_at, now()); end if;
  return new;
end;
$$;
revoke all on function private.prepare_security_incident_update() from public, anon, authenticated;
create trigger prepare_security_incident_update before update on public.security_incidents
for each row execute function private.prepare_security_incident_update();

create or replace function public.consume_api_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); window_start timestamptz; current_hits integer;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if p_bucket not in ('team_invite','team_role_change','team_deactivate','team_reactivate','incident_create','incident_update')
    or p_limit < 1 or p_limit > 100 or p_window_seconds < 60 or p_window_seconds > 86400 then raise exception 'invalid rate limit configuration'; end if;
  window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into private.api_rate_limits (actor_user_id, bucket, window_started_at) values (actor, p_bucket, window_start)
  on conflict (actor_user_id, bucket, window_started_at) do update set hit_count = private.api_rate_limits.hit_count + 1, updated_at = now()
  returning hit_count into current_hits;
  return current_hits <= p_limit;
end;
$$;
revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to authenticated;
