alter table public.care_reminder_runs
  add column if not exists response_kind text,
  add column if not exists response_text text,
  add column if not exists response_received_at timestamptz,
  add column if not exists response_message_id uuid references public.messages(id) on delete set null;

alter table public.care_reminder_runs
  drop constraint if exists care_reminder_runs_response_kind_check;
alter table public.care_reminder_runs
  add constraint care_reminder_runs_response_kind_check
  check (response_kind is null or response_kind in ('confirmed','missed','help'));

create unique index if not exists care_reminder_runs_response_message_idx
  on public.care_reminder_runs (response_message_id)
  where response_message_id is not null;
create index if not exists care_reminder_runs_adherence_attention_idx
  on public.care_reminder_runs (organization_id, response_kind, response_received_at desc)
  where response_kind in ('missed','help');

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

  update public.care_reminder_runs
  set response_kind = v_response_kind,
      response_text = left(v_response_text, 500),
      response_received_at = coalesce(new.timestamp, new.created_at, now()),
      response_message_id = new.id,
      acknowledged_at = coalesce(acknowledged_at, now()),
      acknowledgement = case v_response_kind
        when 'confirmed' then 'Patient confirmed via WhatsApp'
        when 'missed' then 'Patient reported missed or skipped care via WhatsApp'
        else 'Patient requested help via WhatsApp'
      end,
      updated_at = now()
  where id = matched_run.id;

  if v_response_kind in ('missed','help') then
    select * into matched_reminder from public.care_reminders where id = matched_run.reminder_id;
    insert into public.patient_care_tasks (
      organization_id, patient_id, encounter_id, care_plan_id, task_type, title,
      details, due_at, priority, status, created_by
    )
    select matched_run.organization_id, matched_run.patient_id, matched_reminder.encounter_id,
      matched_reminder.care_plan_id, 'call',
      case when v_response_kind = 'help' then 'Patient requested help after care reminder' else 'Review missed patient care reminder' end,
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
drop trigger if exists capture_care_reminder_response on public.messages;
create trigger capture_care_reminder_response
after insert on public.messages
for each row execute function private.capture_care_reminder_response();
