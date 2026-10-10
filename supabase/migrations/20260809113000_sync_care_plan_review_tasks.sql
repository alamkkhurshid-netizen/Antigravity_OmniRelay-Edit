alter table public.patient_care_tasks
  add column care_plan_id uuid references public.patient_care_plans(id) on delete cascade;

create unique index patient_care_tasks_care_plan_idx
  on public.patient_care_tasks (care_plan_id)
  where care_plan_id is not null;

create or replace function private.sync_care_plan_review_task()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  task_details text;
begin
  task_details := nullif(concat_ws(E'\n\n', new.goal, new.instructions), '');

  if new.status = 'active' and new.next_review_at is not null then
    insert into public.patient_care_tasks (
      organization_id,
      patient_id,
      encounter_id,
      care_plan_id,
      task_type,
      title,
      details,
      due_at,
      priority,
      status,
      assigned_to,
      created_by
    ) values (
      new.organization_id,
      new.patient_id,
      new.encounter_id,
      new.id,
      'follow_up',
      left('Review care plan: ' || new.title, 160),
      task_details,
      new.next_review_at,
      'normal',
      'open',
      new.assigned_to,
      new.created_by
    )
    on conflict (care_plan_id) where care_plan_id is not null
    do update set
      patient_id = excluded.patient_id,
      encounter_id = excluded.encounter_id,
      title = excluded.title,
      details = excluded.details,
      due_at = excluded.due_at,
      assigned_to = excluded.assigned_to,
      status = 'open';
  elsif new.status in ('paused', 'cancelled') or new.next_review_at is null then
    update public.patient_care_tasks
      set status = 'cancelled'
      where care_plan_id = new.id
        and status <> 'completed';
  elsif new.status = 'completed' then
    update public.patient_care_tasks
      set status = 'completed'
      where care_plan_id = new.id
        and status <> 'completed';
  end if;

  return new;
end;
$$;

revoke all on function private.sync_care_plan_review_task()
from public, anon, authenticated;

create trigger sync_care_plan_review_task
after insert or update of title, goal, instructions, status, next_review_at, assigned_to, encounter_id
on public.patient_care_plans
for each row execute function private.sync_care_plan_review_task();

insert into public.patient_care_tasks (
  organization_id,
  patient_id,
  encounter_id,
  care_plan_id,
  task_type,
  title,
  details,
  due_at,
  priority,
  status,
  assigned_to,
  created_by
)
select
  plan.organization_id,
  plan.patient_id,
  plan.encounter_id,
  plan.id,
  'follow_up',
  left('Review care plan: ' || plan.title, 160),
  nullif(concat_ws(E'\n\n', plan.goal, plan.instructions), ''),
  plan.next_review_at,
  'normal',
  'open',
  plan.assigned_to,
  plan.created_by
from public.patient_care_plans plan
where plan.status = 'active'
  and plan.next_review_at is not null
on conflict (care_plan_id) where care_plan_id is not null do nothing;
