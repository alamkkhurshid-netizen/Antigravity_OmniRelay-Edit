-- Doctor-authorized medication schedules can dispatch automatically, while
-- manually-created care reminders retain the existing approval gate.
alter table public.care_reminders
  add column if not exists approval_mode text not null default 'manual';

alter table public.care_reminders
  drop constraint if exists care_reminders_approval_mode_check;
alter table public.care_reminders
  add constraint care_reminders_approval_mode_check
  check (approval_mode in ('manual', 'automatic'));

alter table public.care_reminder_runs
  add column if not exists snoozed_until timestamptz;

alter table public.care_reminder_runs
  drop constraint if exists care_reminder_runs_response_kind_check;
alter table public.care_reminder_runs
  add constraint care_reminder_runs_response_kind_check
  check (response_kind is null or response_kind in ('confirmed', 'missed', 'snoozed', 'help'));

create index if not exists care_reminder_runs_patient_adherence_idx
  on public.care_reminder_runs (organization_id, patient_id, response_received_at desc)
  where response_kind is not null;

create or replace function private.authorize_prescription_medication_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reminder_type = 'medication'
     and new.prescription_id is not null
     and new.prescription_item_id is not null then
    new.approval_mode := 'automatic';
  end if;
  return new;
end;
$$;

revoke all on function private.authorize_prescription_medication_schedule() from public, anon, authenticated;
drop trigger if exists authorize_prescription_medication_schedule on public.care_reminders;
create trigger authorize_prescription_medication_schedule
before insert on public.care_reminders
for each row execute function private.authorize_prescription_medication_schedule();

create or replace function private.materialize_due_care_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_count integer := 0;
begin
  with due as (
    select r.*
    from public.care_reminders r
    where r.status = 'active'
      and r.next_run_at <= now()
      and r.next_run_at >= now() - interval '24 hours'
    for update skip locked
  ), inserted as (
    insert into public.care_reminder_runs (
      organization_id, reminder_id, patient_id, scheduled_for, channel,
      status, approved_by, approved_at, next_attempt_at
    )
    select
      d.organization_id,
      d.id,
      d.patient_id,
      d.next_run_at,
      d.channel,
      case
        when not d.consent_snapshot then 'skipped'
        when d.approval_mode = 'automatic' then 'approved'
        else 'ready'
      end,
      case when d.consent_snapshot and d.approval_mode = 'automatic' then d.created_by else null end,
      case when d.consent_snapshot and d.approval_mode = 'automatic' then now() else null end,
      case when d.consent_snapshot and d.approval_mode = 'automatic' then now() else null end
    from due d
    on conflict (reminder_id, scheduled_for) do nothing
    returning 1
  ), advanced as (
    update public.care_reminders r
    set
      last_run_at = r.next_run_at,
      next_run_at = case
        when r.schedule_kind = 'daily' then r.next_run_at + interval '1 day'
        else r.next_run_at
      end,
      status = case
        when r.schedule_kind = 'one_time' then 'completed'
        when r.ends_on is not null
          and ((r.next_run_at + interval '1 day') at time zone r.timezone)::date > r.ends_on
          then 'completed'
        else r.status
      end,
      updated_at = now()
    from due d
    where r.id = d.id
    returning r.id
  )
  select count(*) into created_count from inserted;

  return created_count;
end;
$$;

revoke all on function private.materialize_due_care_reminders() from public, anon, authenticated;
grant execute on function private.materialize_due_care_reminders() to postgres;

create or replace function private.capture_care_reminder_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response_text text;
  normalized text;
  v_response_kind text;
  matched_run public.care_reminder_runs%rowtype;
  matched_reminder public.care_reminders%rowtype;
  v_snoozed_until timestamptz;
begin
  if new.direction::text <> 'incoming' or new.service::text <> 'whatsapp' then return new; end if;

  v_response_text := btrim(coalesce(
    new.content->>'text',
    new.content#>>'{data,button_reply,title}',
    new.content#>>'{data,list_reply,title}',
    ''
  ));
  normalized := lower(regexp_replace(v_response_text, '[^a-z0-9]+', '', 'g'));
  v_response_kind := case
    when normalized in ('done','taken','yes','1') then 'confirmed'
    when normalized in ('skip','skipped','missed','no','2') then 'missed'
    when normalized in ('help','problem','unwell','3') then 'help'
    when normalized in ('snooze','later','remindme','4') then 'snoozed'
    else null
  end;
  if v_response_kind is null then return new; end if;

  select run.* into matched_run
  from public.care_reminder_runs run
  join public.care_reminders reminder on reminder.id = run.reminder_id
  join public.messages outbound on outbound.id::text = run.provider_response->>'message_id'
  where run.organization_id = new.organization_id
    and run.patient_id = reminder.patient_id
    and reminder.reminder_type in ('medication','follow_up','care','test')
    and outbound.conversation_id = new.conversation_id
    and outbound.direction::text = 'outgoing'
    and outbound.created_at >= now() - interval '48 hours'
    and run.response_received_at is null
    and run.status in ('sent','delivered','read')
  order by outbound.created_at desc
  limit 1;

  if matched_run.id is null then return new; end if;
  v_snoozed_until := case when v_response_kind = 'snoozed' then now() + interval '15 minutes' else null end;

  update public.care_reminder_runs
  set response_kind = v_response_kind,
      response_text = left(v_response_text, 500),
      response_received_at = coalesce(new.timestamp, new.created_at, now()),
      response_message_id = new.id,
      snoozed_until = v_snoozed_until,
      acknowledged_at = coalesce(acknowledged_at, now()),
      acknowledgement = case v_response_kind
        when 'confirmed' then 'Patient marked dose or care as taken'
        when 'missed' then 'Patient marked dose or care as skipped'
        when 'snoozed' then 'Patient snoozed reminder for 15 minutes'
        else 'Patient requested help via WhatsApp'
      end,
      updated_at = now()
  where id = matched_run.id;

  if v_response_kind = 'snoozed' then
    insert into public.care_reminder_runs (
      organization_id, reminder_id, patient_id, scheduled_for, channel,
      status, approved_by, approved_at, next_attempt_at
    ) values (
      matched_run.organization_id, matched_run.reminder_id, matched_run.patient_id,
      v_snoozed_until, matched_run.channel, 'approved', matched_run.approved_by,
      now(), v_snoozed_until
    ) on conflict (reminder_id, scheduled_for) do nothing;
  elsif v_response_kind in ('missed','help') then
    select * into matched_reminder from public.care_reminders where id = matched_run.reminder_id;
    insert into public.patient_care_tasks (
      organization_id, patient_id, encounter_id, care_plan_id, task_type, title,
      details, due_at, priority, status, created_by
    )
    select matched_run.organization_id, matched_run.patient_id, matched_reminder.encounter_id,
      matched_reminder.care_plan_id, 'call',
      case when v_response_kind = 'help' then 'Patient requested help after care reminder' else 'Review skipped patient medication or care' end,
      'Patient WhatsApp response: ' || left(v_response_text, 500) || E'\n\nReminder run: ' || matched_run.id::text,
      now(), case when v_response_kind = 'help' then 'urgent' else 'high' end, 'open', matched_reminder.created_by
    where not exists (
      select 1 from public.patient_care_tasks task
      where task.organization_id = matched_run.organization_id
        and task.details like '%' || matched_run.id::text || '%'
        and task.status in ('open','in_progress')
    );
  end if;

  return new;
end;
$$;

revoke all on function private.capture_care_reminder_response() from public, anon, authenticated;

create or replace view public.patient_medication_adherence
with (security_invoker = true)
as
select
  run.organization_id,
  run.patient_id,
  count(*) filter (where reminder.reminder_type = 'medication')::integer as total_doses,
  count(*) filter (where reminder.reminder_type = 'medication' and run.response_kind = 'confirmed')::integer as taken_doses,
  count(*) filter (where reminder.reminder_type = 'medication' and run.response_kind = 'missed')::integer as skipped_doses,
  count(*) filter (where reminder.reminder_type = 'medication' and run.response_kind = 'snoozed')::integer as snoozed_doses,
  count(*) filter (where reminder.reminder_type = 'medication' and run.response_kind = 'help')::integer as help_requests,
  round(
    100.0 * count(*) filter (where reminder.reminder_type = 'medication' and run.response_kind = 'confirmed') /
    nullif(count(*) filter (where reminder.reminder_type = 'medication' and run.response_kind in ('confirmed','missed')), 0),
    1
  ) as adherence_percent,
  max(run.response_received_at) as last_response_at
from public.care_reminder_runs run
join public.care_reminders reminder on reminder.id = run.reminder_id
where run.scheduled_for >= now() - interval '30 days'
group by run.organization_id, run.patient_id;

revoke all on public.patient_medication_adherence from public, anon;
grant select on public.patient_medication_adherence to authenticated;

-- Existing prescription-generated medication schedules were already authorized
-- by a signed-in clinic administrator. Make them automatic without changing
-- manually-created reminder schedules.
update public.care_reminders
set approval_mode = 'automatic', updated_at = now()
where reminder_type = 'medication'
  and prescription_id is not null
  and prescription_item_id is not null;
