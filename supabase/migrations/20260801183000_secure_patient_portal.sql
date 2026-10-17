alter table public.whatsapp_booking_settings
  add column if not exists patient_portal_base_url text not null
  default 'https://omnirelay-light.alam-kkhurshid.chatgpt.site';

alter table public.whatsapp_booking_settings
  drop constraint if exists whatsapp_booking_settings_patient_portal_url_check;
alter table public.whatsapp_booking_settings
  add constraint whatsapp_booking_settings_patient_portal_url_check
  check (patient_portal_base_url ~ '^https://[^[:space:]]+$');

create table if not exists private.patient_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  token_hash bytea not null unique,
  scope text not null check (scope in ('bookings','records','all')),
  expires_at timestamptz not null,
  last_accessed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists patient_portal_sessions_patient_idx
  on private.patient_portal_sessions (organization_id, patient_id, expires_at desc);
create index if not exists patient_portal_sessions_active_idx
  on private.patient_portal_sessions (expires_at)
  where revoked_at is null;

alter table private.patient_portal_sessions enable row level security;
revoke all on private.patient_portal_sessions from public, anon, authenticated;

create or replace function public.create_patient_portal_session(
  p_organization_id uuid,
  p_phone text,
  p_conversation_id uuid default null,
  p_scope text default 'all'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient public.patient_profiles%rowtype;
  v_token text;
  v_expires_at timestamptz := now() + interval '15 minutes';
  v_phone text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
begin
  if p_scope not in ('bookings','records','all') then
    raise exception 'Invalid portal scope';
  end if;
  if length(v_phone) < 10 then
    return jsonb_build_object('found', false);
  end if;

  select p.* into v_patient
  from public.patient_profiles p
  where p.organization_id = p_organization_id
    and (
      regexp_replace(coalesce(p.phone,''), '\D', '', 'g') = v_phone
      or regexp_replace(coalesce(p.primary_contact_phone,''), '\D', '', 'g') = v_phone
    )
  order by case when regexp_replace(coalesce(p.phone,''), '\D', '', 'g') = v_phone then 0 else 1 end,
           p.updated_at desc
  limit 1;

  if v_patient.id is null then
    return jsonb_build_object('found', false);
  end if;

  update private.patient_portal_sessions
     set revoked_at = now()
   where organization_id = p_organization_id
     and patient_id = v_patient.id
     and scope = p_scope
     and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.patient_portal_sessions(
    organization_id, patient_id, conversation_id, token_hash, scope, expires_at
  ) values (
    p_organization_id, v_patient.id, p_conversation_id,
    extensions.digest(convert_to(v_token,'UTF8'),'sha256'), p_scope, v_expires_at
  );

  return jsonb_build_object(
    'found', true,
    'token', v_token,
    'expires_at', v_expires_at,
    'patient_name', v_patient.full_name
  );
end;
$$;

create or replace function public.get_patient_portal(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.patient_portal_sessions%rowtype;
  v_result jsonb;
begin
  select * into v_session
  from private.patient_portal_sessions s
  where s.token_hash = extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.revoked_at is null and s.expires_at > now();
  if v_session.id is null then raise exception 'This secure link is invalid or has expired'; end if;

  update private.patient_portal_sessions set last_accessed_at = now() where id = v_session.id;

  select jsonb_build_object(
    'scope', v_session.scope,
    'expires_at', v_session.expires_at,
    'patient', jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'age', p.age,
      'locality', p.locality, 'pincode', p.pincode
    ),
    'business', coalesce(op.business_name, o.name),
    'appointments', case when v_session.scope in ('bookings','all') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status,
        'service_id', a.service_id, 'location_id', a.location_id, 'resource_id', a.resource_id,
        'service', sv.name, 'location', l.name, 'provider', r.name, 'slug', bp.slug
      ) order by a.starts_at desc)
      from public.appointments a
      join public.organization_services sv on sv.id = a.service_id
      join public.business_locations l on l.id = a.location_id
      join public.booking_resources r on r.id = a.resource_id
      left join public.booking_pages bp on bp.organization_id = a.organization_id and bp.active
      where a.organization_id = v_session.organization_id and a.patient_id = v_session.patient_id
        and a.starts_at > now() - interval '2 years'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'visits', case when v_session.scope in ('records','all') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'occurred_at', e.occurred_at, 'encounter_type', e.encounter_type,
        'follow_up_at', e.follow_up_at, 'follow_up_status', e.follow_up_status
      ) order by e.occurred_at desc)
      from (select * from public.patient_encounters
            where organization_id = v_session.organization_id and patient_id = v_session.patient_id
            order by occurred_at desc limit 20) e
    ), '[]'::jsonb) else '[]'::jsonb end,
    'prescriptions', case when v_session.scope in ('records','all') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rx.id, 'prescription_number', rx.prescription_number, 'issued_at', rx.issued_at,
        'diagnosis', rx.diagnosis, 'advice', rx.advice, 'tests_requested', rx.tests_requested,
        'follow_up_at', rx.follow_up_at,
        'items', coalesce((select jsonb_agg(jsonb_build_object(
          'medicine_name', i.medicine_name, 'dosage', i.dosage, 'frequency', i.frequency,
          'duration', i.duration, 'instructions', i.instructions
        ) order by i.sort_order) from public.prescription_items i where i.prescription_id = rx.id), '[]'::jsonb)
      ) order by rx.issued_at desc)
      from (select * from public.prescriptions
            where organization_id = v_session.organization_id and patient_id = v_session.patient_id
              and status = 'issued'
            order by issued_at desc limit 20) rx
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_result
  from public.patient_profiles p
  join public.organizations o on o.id = p.organization_id
  left join public.onboarding_profiles op on op.organization_id = o.id
  where p.id = v_session.patient_id;

  return v_result;
end;
$$;

create or replace function public.patient_portal_cancel(p_token text, p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_session private.patient_portal_sessions%rowtype; v_org uuid;
begin
  select * into v_session from private.patient_portal_sessions s
  where s.token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.revoked_at is null and s.expires_at > now() and s.scope in ('bookings','all');
  if v_session.id is null then raise exception 'This secure link is invalid or has expired'; end if;
  select organization_id into v_org from public.appointments
  where id=p_appointment_id and organization_id=v_session.organization_id and patient_id=v_session.patient_id
    and starts_at>now() and status in ('pending','confirmed','rescheduling_required');
  if v_org is null then raise exception 'Appointment cannot be cancelled'; end if;
  update public.appointments set status='cancelled',updated_at=now() where id=p_appointment_id;
  update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=p_appointment_id and status='scheduled';
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type)
  values(v_org,p_appointment_id,'cancelled','patient_portal');
end;
$$;

create or replace function public.patient_portal_reschedule(p_token text, p_appointment_id uuid, p_starts_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.patient_portal_sessions%rowtype;
  a public.appointments%rowtype;
  duration_mins int; buffer_mins int; tz text; local_start timestamp; rule record;
begin
  select * into v_session from private.patient_portal_sessions s
  where s.token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.revoked_at is null and s.expires_at > now() and s.scope in ('bookings','all');
  if v_session.id is null then raise exception 'This secure link is invalid or has expired'; end if;
  select * into a from public.appointments
  where id=p_appointment_id and organization_id=v_session.organization_id and patient_id=v_session.patient_id
    and status in ('pending','confirmed','rescheduling_required');
  if a.id is null or p_starts_at<=now() then raise exception 'Appointment cannot be rescheduled'; end if;
  select duration_minutes,buffer_minutes into duration_mins,buffer_mins from public.organization_services where id=a.service_id and active and booking_enabled;
  select timezone into tz from public.booking_resources where id=a.resource_id and active;
  local_start:=p_starts_at at time zone tz;
  select * into rule from public.availability_rules where organization_id=a.organization_id and resource_id=a.resource_id and active
    and weekday=extract(dow from local_start)::int and (location_id=a.location_id or location_id is null)
    order by location_id nulls last limit 1;
  if rule.id is null or local_start::time<rule.start_time
    or local_start::time+make_interval(mins=>duration_mins+buffer_mins)>rule.end_time
    or mod(extract(epoch from (local_start::time-rule.start_time))::int/60,rule.slot_interval_minutes)<>0
  then raise exception 'Selected time is not available'; end if;
  update public.appointments set starts_at=p_starts_at,ends_at=p_starts_at+make_interval(mins=>duration_mins+buffer_mins),status='confirmed',updated_at=now() where id=a.id;
  update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=a.id and status='scheduled';
  perform private.queue_appointment_reminders(a.id);
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
  values(a.organization_id,a.id,'rescheduled','patient_portal',jsonb_build_object('old_starts_at',a.starts_at,'new_starts_at',p_starts_at));
exception when exclusion_violation then raise exception 'That time was just booked. Please choose another slot';
end;
$$;

revoke all on function public.create_patient_portal_session(uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function public.get_patient_portal(text) from public, anon, authenticated;
revoke all on function public.patient_portal_cancel(text,uuid) from public, anon, authenticated;
revoke all on function public.patient_portal_reschedule(text,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.create_patient_portal_session(uuid,text,uuid,text) to service_role;
grant execute on function public.get_patient_portal(text) to service_role;
grant execute on function public.patient_portal_cancel(text,uuid) to service_role;
grant execute on function public.patient_portal_reschedule(text,uuid,timestamptz) to service_role;
