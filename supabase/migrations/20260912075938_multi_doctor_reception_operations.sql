-- Reception queue state is operational only. Patient WhatsApp queue notices
-- stay disabled until a dedicated Meta-approved patient template is configured.
create table public.appointment_queue_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  resource_id uuid not null references public.booking_resources(id) on delete cascade,
  location_id uuid not null references public.business_locations(id) on delete cascade,
  queue_date date not null,
  token_number integer not null check (token_number between 1 and 9999),
  queue_status text not null default 'waiting' check (queue_status in ('waiting','called','served','cancelled')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, resource_id, location_id, queue_date, token_number)
);
create index appointment_queue_session_idx on public.appointment_queue_entries(organization_id,resource_id,location_id,queue_date,queue_status,token_number);
alter table public.appointment_queue_entries enable row level security;
grant select,insert,update on public.appointment_queue_entries to authenticated;
create policy "members read appointment queue" on public.appointment_queue_entries for select to authenticated using(private.is_organization_member(organization_id,'member'));
create policy "admins manage appointment queue" on public.appointment_queue_entries for all to authenticated using(private.is_organization_member(organization_id,'admin')) with check(private.is_organization_member(organization_id,'admin'));

create or replace function public.assign_appointment_queue_token(p_organization_id uuid,p_appointment_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.appointments%rowtype; queue_day date; next_token integer; existing public.appointment_queue_entries%rowtype;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  select * into a from public.appointments where id=p_appointment_id and organization_id=p_organization_id for update;
  if a.id is null then raise exception 'Appointment not found'; end if;
  if a.status not in ('confirmed','arrived','in_consultation') then raise exception 'Only active appointments can join today''s queue'; end if;
  select * into existing from public.appointment_queue_entries where appointment_id=a.id;
  if existing.id is not null then return jsonb_build_object('token_number',existing.token_number,'queue_status',existing.queue_status,'already_assigned',true); end if;
  queue_day := (a.starts_at at time zone 'Asia/Kolkata')::date;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||a.resource_id::text||':'||a.location_id::text||':'||queue_day::text,0));
  select coalesce(max(token_number),0)+1 into next_token from public.appointment_queue_entries where organization_id=p_organization_id and resource_id=a.resource_id and location_id=a.location_id and queue_date=queue_day;
  insert into public.appointment_queue_entries(organization_id,appointment_id,resource_id,location_id,queue_date,token_number)
  values(p_organization_id,a.id,a.resource_id,a.location_id,queue_day,next_token);
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,actor_id,details)
  values(p_organization_id,a.id,'queue_token_assigned','staff',auth.uid(),jsonb_build_object('token_number',next_token));
  return jsonb_build_object('token_number',next_token,'queue_status','waiting','already_assigned',false);
end; $$;
revoke all on function public.assign_appointment_queue_token(uuid,uuid) from public,anon;
grant execute on function public.assign_appointment_queue_token(uuid,uuid) to authenticated;

create or replace function public.set_queue_now_serving(p_organization_id uuid,p_resource_id uuid,p_location_id uuid,p_queue_date date,p_token_number integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.appointment_queue_entries%rowtype;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  select * into target from public.appointment_queue_entries where organization_id=p_organization_id and resource_id=p_resource_id and location_id=p_location_id and queue_date=p_queue_date and token_number=p_token_number for update;
  if target.id is null then raise exception 'Queue token not found'; end if;
  update public.appointment_queue_entries set queue_status='waiting',updated_at=now() where organization_id=p_organization_id and resource_id=p_resource_id and location_id=p_location_id and queue_date=p_queue_date and queue_status='called';
  update public.appointment_queue_entries set queue_status='called',updated_at=now() where id=target.id;
  return jsonb_build_object('token_number',target.token_number,'queue_status','called','whatsapp_delivery','disabled_until_patient_queue_template_is_approved');
end; $$;
revoke all on function public.set_queue_now_serving(uuid,uuid,uuid,date,integer) from public,anon;
grant execute on function public.set_queue_now_serving(uuid,uuid,uuid,date,integer) to authenticated;

-- Move an affected booking to a suitable colleague. The target must be an active
-- provider for the same chamber/service and a genuinely open scheduled slot.
create or replace function public.reassign_appointment_provider(p_organization_id uuid,p_appointment_id uuid,p_resource_id uuid,p_starts_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.appointments%rowtype; duration_minutes integer; buffer_minutes integer; target_tz text; local_start timestamp; local_end timestamp; target_end timestamptz; reminder_channel text; reminder_recipient text;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  if p_starts_at <= now() then raise exception 'Choose a future substitute appointment time'; end if;
  select * into a from public.appointments where id=p_appointment_id and organization_id=p_organization_id for update;
  if a.id is null then raise exception 'Appointment not found'; end if;
  if a.status not in ('confirmed','arrived','rescheduling_required') then raise exception 'Only active appointments can be reassigned'; end if;
  if p_resource_id=a.resource_id then raise exception 'Choose a different doctor for a substitute appointment'; end if;
  select coalesce(x.duration_minutes,s.duration_minutes),coalesce(x.buffer_minutes,s.buffer_minutes,0),r.timezone into duration_minutes,buffer_minutes,target_tz
  from public.provider_location_assignments pa
  join public.provider_location_services x on x.assignment_id=pa.id and x.organization_id=pa.organization_id and x.service_id=a.service_id and x.active
  join public.organization_services s on s.id=a.service_id and s.organization_id=a.organization_id and s.active and s.booking_enabled
  join public.booking_resources r on r.id=pa.resource_id and r.organization_id=pa.organization_id and r.active
  where pa.organization_id=p_organization_id and pa.resource_id=p_resource_id and pa.location_id=a.location_id and pa.active
  limit 1;
  if duration_minutes is null then raise exception 'That doctor is not configured for this chamber and service'; end if;
  local_start:=p_starts_at at time zone coalesce(target_tz,'Asia/Kolkata');
  local_end:=local_start+make_interval(mins=>duration_minutes+buffer_minutes);
  target_end:=p_starts_at+make_interval(mins=>duration_minutes+buffer_minutes);
  if not exists(select 1 from public.availability_rules v where v.organization_id=p_organization_id and v.resource_id=p_resource_id and v.active and (v.location_id=a.location_id or (v.location_id is null and not exists(select 1 from public.availability_rules exact where exact.organization_id=p_organization_id and exact.resource_id=p_resource_id and exact.location_id=a.location_id and exact.active and exact.weekday=extract(dow from local_start)::int))) and v.weekday=extract(dow from local_start)::int and (v.effective_from is null or local_start::date>=v.effective_from) and (v.effective_to is null or local_start::date<=v.effective_to) and local_start::time>=v.start_time and local_end::time<=v.end_time and mod(extract(epoch from(local_start::time-v.start_time))::integer/60,v.slot_interval_minutes)=0) then raise exception 'That doctor is not available at the selected time'; end if;
  if exists(select 1 from public.schedule_exceptions e where e.organization_id=p_organization_id and e.status='active' and (e.resource_id is null or e.resource_id=p_resource_id) and (e.location_id is null or e.location_id=a.location_id) and p_starts_at<e.ends_at and target_end>e.starts_at) then raise exception 'That time is blocked by a schedule exception'; end if;
  if exists(select 1 from public.appointments other where other.organization_id=p_organization_id and other.resource_id=p_resource_id and other.id<>a.id and other.status in ('pending','payment_pending','confirmed','arrived','in_consultation','rescheduling_required') and p_starts_at<other.ends_at and target_end>other.starts_at) then raise exception 'That substitute slot was just booked'; end if;
  update public.appointments set resource_id=p_resource_id,starts_at=p_starts_at,ends_at=target_end,status='confirmed',updated_at=now() where id=a.id;
  update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=a.id and event_type in ('reminder_24h','reminder_2h') and status='scheduled';
  if a.care_communications_consent then
    reminder_channel:=case when nullif(trim(coalesce(a.customer_phone,'')),'') is not null then 'whatsapp' else 'email' end;
    reminder_recipient:=coalesce(nullif(trim(coalesce(a.customer_phone,'')),''),nullif(trim(coalesce(a.customer_email,'')),''));
    if reminder_recipient is not null then insert into public.reminder_events(organization_id,appointment_id,event_type,scheduled_for,channel,recipient,status,provider_response) values(p_organization_id,a.id,'reschedule',now(),reminder_channel,reminder_recipient,'scheduled',jsonb_build_object('purpose','substitute_doctor','previous_resource_id',a.resource_id,'new_resource_id',p_resource_id)) on conflict(appointment_id,event_type,channel) do update set scheduled_for=excluded.scheduled_for,recipient=excluded.recipient,status='scheduled',attempts=0,updated_at=now(),provider_response=excluded.provider_response; end if;
  end if;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,actor_id,details) values(p_organization_id,a.id,'substitute_doctor_assigned','staff',auth.uid(),jsonb_build_object('previous_resource_id',a.resource_id,'new_resource_id',p_resource_id,'starts_at',p_starts_at));
  return jsonb_build_object('appointment_id',a.id,'resource_id',p_resource_id,'starts_at',p_starts_at,'ends_at',target_end);
end; $$;
revoke all on function public.reassign_appointment_provider(uuid,uuid,uuid,timestamptz) from public,anon;
grant execute on function public.reassign_appointment_provider(uuid,uuid,uuid,timestamptz) to authenticated;
