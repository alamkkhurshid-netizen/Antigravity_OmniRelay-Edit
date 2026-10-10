-- Preserve the channel-specific patient portal audit identity already emitted by
-- the portal RPCs, and add an atomic service-role-only WhatsApp management path.

alter table public.appointment_events drop constraint appointment_events_actor_type_check;
alter table public.appointment_events add constraint appointment_events_actor_type_check
  check (actor_type in ('customer','patient_portal','staff','system'));

create or replace function public.manage_whatsapp_appointment(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_contact_address text,
  p_appointment_id uuid,
  p_action text,
  p_starts_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.appointments%rowtype;
  contact_phone text := regexp_replace(coalesce(p_contact_address,''),'\D','','g');
  duration_mins integer;
  buffer_mins integer;
  tz text;
  local_start timestamp;
  availability record;
  old_starts_at timestamptz;
begin
  if p_action not in ('cancel','reschedule') then raise exception 'Unsupported appointment action'; end if;
  if not exists (
    select 1 from public.conversations c
    where c.id=p_conversation_id and c.organization_id=p_organization_id
      and c.service::text='whatsapp'
      and regexp_replace(coalesce(c.contact_address,''),'\D','','g')=contact_phone
  ) then raise exception 'WhatsApp identity could not be verified'; end if;

  select * into a from public.appointments
  where id=p_appointment_id and organization_id=p_organization_id
    and starts_at>now() and status in ('pending','confirmed','rescheduling_required')
    and (regexp_replace(coalesce(booking_contact_phone,''),'\D','','g')=contact_phone
      or regexp_replace(coalesce(customer_phone,''),'\D','','g')=contact_phone)
  for update;
  if a.id is null then raise exception 'Appointment cannot be managed from this WhatsApp identity'; end if;

  if p_action='cancel' then
    update public.appointments set status='cancelled',updated_at=now() where id=a.id;
    update public.reminder_events set status='cancelled',updated_at=now()
      where appointment_id=a.id and status in ('scheduled','processing');
    insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
      values(a.organization_id,a.id,'cancelled','customer',jsonb_build_object('source','whatsapp','conversation_id',p_conversation_id));
    return jsonb_build_object('ok',true,'action','cancelled');
  end if;

  if p_starts_at is null or p_starts_at<=now() then raise exception 'Choose a future appointment time'; end if;
  select duration_minutes,buffer_minutes into duration_mins,buffer_mins
    from public.organization_services where id=a.service_id and active and booking_enabled;
  select timezone into tz from public.booking_resources where id=a.resource_id and active;
  local_start:=p_starts_at at time zone coalesce(tz,'Asia/Kolkata');
  select * into availability from public.availability_rules
    where organization_id=a.organization_id and resource_id=a.resource_id and active
      and weekday=extract(dow from local_start)::integer
      and (location_id=a.location_id or location_id is null)
    order by location_id nulls last limit 1;
  if availability.id is null or local_start::time<availability.start_time
    or local_start::time+make_interval(mins=>duration_mins+buffer_mins)>availability.end_time
    or mod(extract(epoch from (local_start::time-availability.start_time))::integer/60,availability.slot_interval_minutes)<>0
  then raise exception 'Selected time is not available'; end if;

  old_starts_at:=a.starts_at;
  update public.appointments set starts_at=p_starts_at,
    ends_at=p_starts_at+make_interval(mins=>duration_mins+buffer_mins),status='confirmed',updated_at=now()
    where id=a.id;
  update public.reminder_events set status='cancelled',updated_at=now()
    where appointment_id=a.id and status in ('scheduled','processing');
  perform private.queue_appointment_reminders(a.id);
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
    values(a.organization_id,a.id,'rescheduled','customer',jsonb_build_object(
      'source','whatsapp','conversation_id',p_conversation_id,'old_starts_at',old_starts_at,'new_starts_at',p_starts_at));
  return jsonb_build_object('ok',true,'action','rescheduled','starts_at',p_starts_at);
exception when exclusion_violation then
  raise exception 'That time was just booked. Please choose another slot';
end;
$$;

revoke all on function public.manage_whatsapp_appointment(uuid,uuid,text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.manage_whatsapp_appointment(uuid,uuid,text,uuid,text,timestamptz) to service_role;
