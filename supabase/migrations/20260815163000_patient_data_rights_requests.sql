-- Controlled patient data-rights requests. This workflow records and reviews requests;
-- it never automatically deletes or exports clinical records.

create table public.patient_data_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null references public.patient_profiles(id) on delete restrict,
  reference text not null default ('DSR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))) unique,
  request_type text not null check (request_type in ('access_export','correction','consent_withdrawal','erasure')),
  status text not null default 'submitted' check (status in ('submitted','identity_verified','under_review','approved','processing','completed','rejected','cancelled')),
  source_channel text not null check (source_channel in ('patient_portal','clinic_staff')),
  request_summary text not null check (char_length(trim(request_summary)) between 5 and 1000),
  identity_method text not null,
  identity_verified_at timestamptz not null,
  retention_review text not null default 'pending' check (retention_review in ('pending','retain_full','retain_partial','eligible')),
  retention_reason text check (retention_reason is null or char_length(trim(retention_reason)) between 5 and 1000),
  decision_summary text check (decision_summary is null or char_length(trim(decision_summary)) between 5 and 1000),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or (retention_review <> 'pending' and decision_summary is not null and completed_at is not null)),
  check (request_type <> 'erasure' or status not in ('approved','processing','completed') or retention_review <> 'pending')
);
create index patient_data_requests_org_status_idx on public.patient_data_requests(organization_id,status,created_at desc);
create index patient_data_requests_patient_idx on public.patient_data_requests(organization_id,patient_id,created_at desc);
alter table public.patient_data_requests enable row level security;
revoke all on public.patient_data_requests from public,anon,authenticated;
grant select,insert,update on public.patient_data_requests to authenticated;
create policy "admins read patient data requests" on public.patient_data_requests for select to authenticated using (private.is_organization_member(organization_id,'admin'));
create policy "admins create patient data requests" on public.patient_data_requests for insert to authenticated with check (private.is_organization_member(organization_id,'admin') and created_by=(select auth.uid()) and updated_by=(select auth.uid()));
create policy "admins update patient data requests" on public.patient_data_requests for update to authenticated using (private.is_organization_member(organization_id,'admin')) with check (private.is_organization_member(organization_id,'admin') and updated_by=(select auth.uid()));

create table public.patient_data_request_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null references public.patient_data_requests(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('submitted','status_changed','review_updated')),
  from_status text,
  to_status text not null,
  safe_summary text not null check (char_length(trim(safe_summary)) between 2 and 500),
  created_at timestamptz not null default now()
);
create index patient_data_request_events_request_idx on public.patient_data_request_events(request_id,created_at desc);
alter table public.patient_data_request_events enable row level security;
revoke all on public.patient_data_request_events from public,anon,authenticated;
grant select on public.patient_data_request_events to authenticated;
create policy "admins read patient data request history" on public.patient_data_request_events for select to authenticated using (private.is_organization_member(organization_id,'admin'));

create or replace function private.prepare_patient_data_request_update() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.organization_id is distinct from old.organization_id or new.patient_id is distinct from old.patient_id or new.reference is distinct from old.reference or new.request_type is distinct from old.request_type or new.source_channel is distinct from old.source_channel or new.identity_method is distinct from old.identity_method or new.identity_verified_at is distinct from old.identity_verified_at or new.created_at is distinct from old.created_at then raise exception 'immutable data request identity'; end if;
  if old.status in ('completed','rejected','cancelled') and new.status is distinct from old.status then raise exception 'closed data request cannot be reopened'; end if;
  new.updated_at:=now();
  if new.status='completed' and old.status is distinct from new.status then new.completed_at:=now(); end if;
  return new;
end $$;
revoke all on function private.prepare_patient_data_request_update() from public,anon,authenticated;
create trigger prepare_patient_data_request_update before update on public.patient_data_requests for each row execute function private.prepare_patient_data_request_update();

create or replace function private.audit_patient_data_request() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; summary text;
begin
  if tg_op='INSERT' then kind:='submitted'; summary:='Patient data request submitted through '||new.source_channel||'.';
  elsif old.status is distinct from new.status then kind:='status_changed'; summary:='Request status changed from '||old.status||' to '||new.status||'.';
  else kind:='review_updated'; summary:='Retention or decision review updated.'; end if;
  insert into public.patient_data_request_events(organization_id,request_id,actor_user_id,event_type,from_status,to_status,safe_summary)
  values(new.organization_id,new.id,new.updated_by,kind,case when tg_op='UPDATE' then old.status end,new.status,summary);
  return new;
end $$;
revoke all on function private.audit_patient_data_request() from public,anon,authenticated;
create trigger audit_patient_data_request after insert or update on public.patient_data_requests for each row execute function private.audit_patient_data_request();

create or replace function public.create_patient_data_request_from_portal(p_token text,p_request_type text,p_summary text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.patient_portal_sessions%rowtype; r public.patient_data_requests%rowtype;
begin
  if p_request_type not in ('access_export','correction','consent_withdrawal','erasure') or char_length(trim(coalesce(p_summary,''))) not between 5 and 1000 then raise exception 'invalid request'; end if;
  select * into s from private.patient_portal_sessions x where x.access_token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256') and x.revoked_at is null and x.consumed_at is not null and x.expires_at>now();
  if s.id is null then raise exception 'secure session invalid or expired'; end if;
  if exists(select 1 from public.patient_data_requests d where d.organization_id=s.organization_id and d.patient_id=s.patient_id and d.request_type=p_request_type and d.status not in ('completed','rejected','cancelled')) then raise exception 'an active request of this type already exists'; end if;
  insert into public.patient_data_requests(organization_id,patient_id,request_type,source_channel,request_summary,identity_method,identity_verified_at)
  values(s.organization_id,s.patient_id,p_request_type,'patient_portal',trim(p_summary),'short_lived_whatsapp_portal_session',now()) returning * into r;
  return jsonb_build_object('id',r.id,'reference',r.reference,'request_type',r.request_type,'status',r.status,'created_at',r.created_at);
end $$;
revoke all on function public.create_patient_data_request_from_portal(text,text,text) from public,anon,authenticated;
grant execute on function public.create_patient_data_request_from_portal(text,text,text) to service_role;

create or replace function public.get_patient_data_requests_from_portal(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.patient_portal_sessions%rowtype;
begin
  select * into s from private.patient_portal_sessions x where x.access_token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256') and x.revoked_at is null and x.consumed_at is not null and x.expires_at>now();
  if s.id is null then raise exception 'secure session invalid or expired'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'reference',d.reference,'request_type',d.request_type,'status',d.status,'created_at',d.created_at) order by d.created_at desc) from public.patient_data_requests d where d.organization_id=s.organization_id and d.patient_id=s.patient_id),'[]'::jsonb);
end $$;
revoke all on function public.get_patient_data_requests_from_portal(text) from public,anon,authenticated;
grant execute on function public.get_patient_data_requests_from_portal(text) to service_role;

create or replace function public.consume_api_rate_limit(p_bucket text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); window_start timestamptz; current_hits integer;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if p_bucket not in ('team_invite','team_role_change','team_deactivate','team_reactivate','incident_create','incident_update','data_request_update') or p_limit<1 or p_limit>100 or p_window_seconds<60 or p_window_seconds>86400 then raise exception 'invalid rate limit configuration'; end if;
  window_start:=to_timestamp(floor(extract(epoch from now())/p_window_seconds)*p_window_seconds);
  insert into private.api_rate_limits(actor_user_id,bucket,window_started_at) values(actor,p_bucket,window_start)
  on conflict(actor_user_id,bucket,window_started_at) do update set hit_count=private.api_rate_limits.hit_count+1,updated_at=now() returning hit_count into current_hits;
  return current_hits<=p_limit;
end $$;
revoke all on function public.consume_api_rate_limit(text,integer,integer) from public,anon;
grant execute on function public.consume_api_rate_limit(text,integer,integer) to authenticated,service_role;

comment on table public.patient_data_requests is 'Controlled patient access, correction, consent-withdrawal and erasure requests; no automatic record deletion.';
