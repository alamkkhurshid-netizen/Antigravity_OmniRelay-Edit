update public.automation_workflows w
set status='active',configuration=w.configuration||jsonb_build_object('execution_mode','observe','rollout','pilot_2'),updated_at=now()
where w.trigger_key in ('appointment_reminder','medication_reminder','follow_up_due','doctor_queue')
  and exists (
    select 1 from public.organizations_addresses oa
    where oa.organization_id=w.organization_id and oa.service='whatsapp' and oa.status='connected'
  );

create or replace function private.observe_appointment_reminder_automation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.enqueue_automation_event(
    new.organization_id,'appointment_reminder',new.id::text,
    jsonb_build_object('source','appointment_reminder','event_type',new.event_type,
      'scheduled_for',new.scheduled_for,'channel',new.channel,'status',new.status)
  );
  return new;
end; $$;
drop trigger if exists observe_appointment_reminder_automation on public.reminder_events;
create trigger observe_appointment_reminder_automation after insert on public.reminder_events
for each row execute function private.observe_appointment_reminder_automation();
revoke all on function private.observe_appointment_reminder_automation() from public,anon,authenticated;

create or replace function private.observe_care_reminder_automation() returns trigger
language plpgsql security definer set search_path='' as $$
declare reminder_kind text;
begin
  select reminder_type into reminder_kind from public.care_reminders where id=new.reminder_id and organization_id=new.organization_id;
  perform private.enqueue_automation_event(
    new.organization_id,
    case when reminder_kind='medication' then 'medication_reminder' else 'follow_up_due' end,
    new.id::text,
    jsonb_build_object('source','care_reminder_run','reminder_type',coalesce(reminder_kind,'care'),
      'scheduled_for',new.scheduled_for,'channel',new.channel,'status',new.status)
  );
  return new;
end; $$;
drop trigger if exists observe_care_reminder_automation on public.care_reminder_runs;
create trigger observe_care_reminder_automation after insert on public.care_reminder_runs
for each row execute function private.observe_care_reminder_automation();
revoke all on function private.observe_care_reminder_automation() from public,anon,authenticated;

create or replace function private.observe_doctor_queue_automation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.enqueue_automation_event(
    new.organization_id,'doctor_queue',new.id::text,
    jsonb_build_object('source','doctor_queue','scheduled_for',new.scheduled_for,
      'shift_date',new.shift_date,'resource_id',new.resource_id,'status',new.status)
  );
  return new;
end; $$;
drop trigger if exists observe_doctor_queue_automation on public.doctor_queue_dispatches;
create trigger observe_doctor_queue_automation after insert on public.doctor_queue_dispatches
for each row execute function private.observe_doctor_queue_automation();
revoke all on function private.observe_doctor_queue_automation() from public,anon,authenticated;
