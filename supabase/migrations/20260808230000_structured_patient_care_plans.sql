create table if not exists public.patient_care_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  encounter_id uuid references public.patient_encounters(id) on delete set null,
  plan_type text not null default 'post_visit' check (plan_type in ('chronic_care','post_visit','preventive','recovery','other')),
  title text not null check (char_length(title) between 2 and 160),
  goal text check (goal is null or char_length(goal) <= 1000),
  instructions text check (instructions is null or char_length(instructions) <= 4000),
  status text not null default 'active' check (status in ('draft','active','paused','completed','cancelled')),
  starts_on date not null default current_date,
  target_date date,
  next_review_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_date is null or target_date >= starts_on)
);

create index if not exists patient_care_plans_org_status_review_idx
  on public.patient_care_plans (organization_id, status, next_review_at);
create index if not exists patient_care_plans_patient_created_idx
  on public.patient_care_plans (patient_id, created_at desc);
create index if not exists patient_care_plans_assignee_idx
  on public.patient_care_plans (organization_id, assigned_to, status)
  where assigned_to is not null;

alter table public.patient_care_plans enable row level security;

drop policy if exists "members read patient care plans" on public.patient_care_plans;
create policy "members read patient care plans"
on public.patient_care_plans for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

drop policy if exists "admins create patient care plans" on public.patient_care_plans;
create policy "admins create patient care plans"
on public.patient_care_plans for insert to authenticated
with check (
  private.is_organization_member(organization_id, 'admin')
  and created_by = auth.uid()
);

drop policy if exists "admins update patient care plans" on public.patient_care_plans;
create policy "admins update patient care plans"
on public.patient_care_plans for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));

drop policy if exists "owners delete patient care plans" on public.patient_care_plans;
create policy "owners delete patient care plans"
on public.patient_care_plans for delete to authenticated
using (private.is_organization_member(organization_id, 'owner'));

create or replace function private.normalize_patient_care_plan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.goal := nullif(btrim(coalesce(new.goal, '')), '');
  new.instructions := nullif(btrim(coalesce(new.instructions, '')), '');
  new.updated_at := now();
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif new.status <> 'completed' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_patient_care_plan on public.patient_care_plans;
create trigger normalize_patient_care_plan
before insert or update on public.patient_care_plans
for each row execute function private.normalize_patient_care_plan();

grant select, insert, update, delete on public.patient_care_plans to authenticated;
revoke all on public.patient_care_plans from anon;
