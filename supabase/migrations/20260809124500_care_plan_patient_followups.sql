alter table public.care_reminders
  add column if not exists care_plan_id uuid references public.patient_care_plans(id) on delete cascade;

create unique index if not exists care_reminders_care_plan_idx
  on public.care_reminders (care_plan_id)
  where care_plan_id is not null;

create index if not exists care_reminder_runs_terminal_failure_idx
  on public.care_reminder_runs (reminder_id, updated_at desc)
  where status = 'failed';

create or replace function private.sync_care_plan_patient_reminder()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'active' and new.next_review_at is not null then
    update public.care_reminders
      set status = 'active',
          scheduled_for = new.next_review_at,
          next_run_at = new.next_review_at,
          updated_at = now()
      where care_plan_id = new.id;
  elsif new.status = 'paused' then
    update public.care_reminders
      set status = 'paused', updated_at = now()
      where care_plan_id = new.id and status not in ('completed', 'cancelled');
  elsif new.status = 'completed' then
    update public.care_reminders
      set status = 'completed', updated_at = now()
      where care_plan_id = new.id and status <> 'cancelled';
  elsif new.status = 'cancelled' or new.next_review_at is null then
    update public.care_reminders
      set status = 'cancelled', updated_at = now()
      where care_plan_id = new.id and status <> 'completed';
  end if;
  return new;
end;
$$;

revoke all on function private.sync_care_plan_patient_reminder()
from public, anon, authenticated;

drop trigger if exists sync_care_plan_patient_reminder on public.patient_care_plans;
create trigger sync_care_plan_patient_reminder
after update of status, next_review_at on public.patient_care_plans
for each row execute function private.sync_care_plan_patient_reminder();

create or replace function private.escalate_failed_care_plan_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_reminder public.care_reminders%rowtype;
begin
  if new.status <> 'failed' or new.attempt_count < new.max_attempts then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'failed' and old.attempt_count = new.attempt_count then
    return new;
  end if;

  select * into linked_reminder
  from public.care_reminders
  where id = new.reminder_id and care_plan_id is not null;

  if linked_reminder.id is null then return new; end if;

  update public.patient_care_tasks
    set task_type = 'call',
        title = left('Resolve failed patient reminder: ' || linked_reminder.title, 160),
        details = concat_ws(E'\n\n', linked_reminder.instructions, 'Delivery failure: ' || coalesce(new.failure_reason, 'Unknown provider failure.')),
        due_at = now(),
        priority = 'high',
        status = 'open',
        completed_by = null,
        completed_at = null,
        updated_at = now()
    where care_plan_id = linked_reminder.care_plan_id;

  return new;
end;
$$;

revoke all on function private.escalate_failed_care_plan_reminder()
from public, anon, authenticated;

drop trigger if exists escalate_failed_care_plan_reminder on public.care_reminder_runs;
create trigger escalate_failed_care_plan_reminder
after insert or update of status, attempt_count on public.care_reminder_runs
for each row execute function private.escalate_failed_care_plan_reminder();
