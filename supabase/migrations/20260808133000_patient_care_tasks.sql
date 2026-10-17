create table public.patient_care_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  encounter_id uuid references public.patient_encounters(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  task_type text not null default 'care'
    check (task_type in ('follow_up','call','test_review','document','care','other')),
  title text not null check (char_length(trim(title)) between 2 and 160),
  details text,
  due_at timestamptz,
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  status text not null default 'open'
    check (status in ('open','in_progress','completed','cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'completed' and completed_at is not null and completed_by is not null)
    or (status <> 'completed' and completed_at is null and completed_by is null)
  )
);

create index patient_care_tasks_org_queue_idx
  on public.patient_care_tasks (organization_id, status, due_at)
  where status in ('open','in_progress');
create index patient_care_tasks_patient_time_idx
  on public.patient_care_tasks (organization_id, patient_id, created_at desc);
create index patient_care_tasks_assignee_queue_idx
  on public.patient_care_tasks (assigned_to, status, due_at)
  where assigned_to is not null and status in ('open','in_progress');

alter table public.patient_care_tasks enable row level security;
grant select, insert, update, delete on public.patient_care_tasks to authenticated;

create policy "members read patient care tasks"
on public.patient_care_tasks for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins create patient care tasks"
on public.patient_care_tasks for insert to authenticated
with check (
  private.is_organization_member(organization_id, 'admin')
  and created_by = (select auth.uid())
  and (assigned_to is null or exists (
    select 1 from public.agents a
    where a.organization_id = patient_care_tasks.organization_id
      and a.user_id = patient_care_tasks.assigned_to
  ))
);

create policy "admins update patient care tasks"
on public.patient_care_tasks for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (
  private.is_organization_member(organization_id, 'admin')
  and (assigned_to is null or exists (
    select 1 from public.agents a
    where a.organization_id = patient_care_tasks.organization_id
      and a.user_id = patient_care_tasks.assigned_to
  ))
);

create policy "owners delete patient care tasks"
on public.patient_care_tasks for delete to authenticated
using (private.is_organization_member(organization_id, 'owner'));

create or replace function private.normalize_patient_care_task()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.title := trim(new.title);
  new.details := nullif(trim(coalesce(new.details, '')), '');
  new.updated_at := now();

  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_by := (select auth.uid());
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_by := null;
    new.completed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.normalize_patient_care_task()
from public, anon, authenticated;

create trigger normalize_patient_care_task
before insert or update on public.patient_care_tasks
for each row execute function private.normalize_patient_care_task();
