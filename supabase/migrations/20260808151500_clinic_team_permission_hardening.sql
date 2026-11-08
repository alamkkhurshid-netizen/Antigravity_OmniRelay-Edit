-- Limit self-service actions to exactly what the team UI promises.

revoke update on public.app_notifications from authenticated;
grant update (read_at) on public.app_notifications to authenticated;

create or replace function private.enforce_assignee_task_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_organization_member(new.organization_id, 'admin') then
    if old.assigned_to is distinct from (select auth.uid())
      or new.assigned_to is distinct from old.assigned_to
      or new.organization_id is distinct from old.organization_id
      or new.patient_id is distinct from old.patient_id
      or new.encounter_id is distinct from old.encounter_id
      or new.appointment_id is distinct from old.appointment_id
      or new.task_type is distinct from old.task_type
      or new.title is distinct from old.title
      or new.details is distinct from old.details
      or new.due_at is distinct from old.due_at
      or new.priority is distinct from old.priority
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'assignees may only change task status';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_assignee_task_update() from public, anon, authenticated;

create trigger enforce_assignee_task_update
before update on public.patient_care_tasks
for each row execute function private.enforce_assignee_task_update();

