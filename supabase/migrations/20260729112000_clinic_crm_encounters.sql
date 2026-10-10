create table public.patient_encounters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  encounter_type text not null default 'consultation'
    check (encounter_type in ('consultation','follow_up','procedure','vaccination','other')),
  occurred_at timestamptz not null default now(),
  diagnosis text,
  clinical_note text not null,
  treatment_plan text,
  follow_up_at timestamptz,
  follow_up_status text not null default 'not_required'
    check (follow_up_status in ('not_required','scheduled','due','completed','cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (follow_up_at is null or follow_up_status <> 'not_required')
);

create index patient_encounters_org_patient_time_idx
  on public.patient_encounters (organization_id, patient_id, occurred_at desc);

create index patient_encounters_org_follow_up_idx
  on public.patient_encounters (organization_id, follow_up_at)
  where follow_up_at is not null and follow_up_status in ('scheduled','due');

alter table public.patient_encounters enable row level security;
grant select, insert, update, delete on public.patient_encounters to authenticated;

create policy "members read patient encounters"
on public.patient_encounters for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins create patient encounters"
on public.patient_encounters for insert to authenticated
with check (
  private.is_organization_member(organization_id, 'admin')
  and created_by = auth.uid()
);

create policy "admins update patient encounters"
on public.patient_encounters for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));

create policy "owners delete patient encounters"
on public.patient_encounters for delete to authenticated
using (private.is_organization_member(organization_id, 'owner'));

create or replace function private.mark_due_patient_follow_ups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.follow_up_at is not null
     and new.follow_up_at <= now()
     and new.follow_up_status = 'scheduled' then
    new.follow_up_status := 'due';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.mark_due_patient_follow_ups()
from public, anon, authenticated;

create trigger normalize_patient_follow_up
before insert or update on public.patient_encounters
for each row execute function private.mark_due_patient_follow_ups();
