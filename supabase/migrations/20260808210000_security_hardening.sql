-- Private tables are accessed only through narrowly scoped security-definer
-- functions. Enabling RLS without client policies makes that boundary explicit.

alter table private.platform_operators enable row level security;
alter table private.customer_booking_access enable row level security;

revoke all on private.platform_operators from public, anon, authenticated;
revoke all on private.customer_booking_access from public, anon, authenticated;

-- A patient-facing URL token is now single-use. It is exchanged once for a
-- separate short-lived session token, which never appears in the URL.

alter table private.patient_portal_sessions
  add column if not exists consumed_at timestamptz,
  add column if not exists access_token_hash bytea;

create unique index if not exists patient_portal_sessions_access_token_idx
  on private.patient_portal_sessions (access_token_hash)
  where access_token_hash is not null;

create or replace function public.exchange_patient_portal_link(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.patient_portal_sessions%rowtype;
  v_access_token text;
begin
  select * into v_session
  from private.patient_portal_sessions s
  where s.token_hash = extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.revoked_at is null
    and s.consumed_at is null
    and s.expires_at > now()
  for update;

  if v_session.id is null then
    raise exception 'This secure link is invalid, expired, or already used';
  end if;

  v_access_token := encode(extensions.gen_random_bytes(32), 'hex');
  update private.patient_portal_sessions
  set consumed_at = now(),
      last_accessed_at = now(),
      access_token_hash = extensions.digest(convert_to(v_access_token,'UTF8'),'sha256')
  where id = v_session.id;

  return jsonb_build_object(
    'access_token', v_access_token,
    'expires_at', v_session.expires_at
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
  where s.access_token_hash = extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.revoked_at is null and s.consumed_at is not null and s.expires_at > now();
  if v_session.id is null then raise exception 'This secure session is invalid or has expired'; end if;

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

-- Existing mutation functions continue to enforce organization, patient,
-- appointment and scope boundaries, but now accept only exchanged sessions.

create or replace function public.patient_portal_cancel(p_token text, p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_session private.patient_portal_sessions%rowtype; v_org uuid;
begin
  select * into v_session from private.patient_portal_sessions s
  where s.access_token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.revoked_at is null and s.consumed_at is not null and s.expires_at > now() and s.scope in ('bookings','all');
  if v_session.id is null then raise exception 'This secure session is invalid or has expired'; end if;
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
  where s.access_token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.revoked_at is null and s.consumed_at is not null and s.expires_at > now() and s.scope in ('bookings','all');
  if v_session.id is null then raise exception 'This secure session is invalid or has expired'; end if;
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

revoke all on function public.exchange_patient_portal_link(text) from public, anon, authenticated;
grant execute on function public.exchange_patient_portal_link(text) to service_role;
