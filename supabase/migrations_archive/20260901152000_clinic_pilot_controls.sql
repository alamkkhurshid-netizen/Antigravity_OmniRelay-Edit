create table public.clinic_pilot_controls (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  pilot_owner_name text not null check (char_length(trim(pilot_owner_name)) between 2 and 120),
  rollback_owner_name text not null check (char_length(trim(rollback_owner_name)) between 2 and 120),
  health_status text not null default 'hold' check (health_status in ('hold','go')),
  health_note text check (health_note is null or char_length(trim(health_note)) between 3 and 500),
  reviewed_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.clinic_pilot_controls enable row level security;
revoke all on public.clinic_pilot_controls from public, anon;
grant select, insert, update on public.clinic_pilot_controls to authenticated;

create policy "members read clinic pilot controls" on public.clinic_pilot_controls for select to authenticated
using (private.is_organization_member(organization_id, 'member'));
create policy "admins insert clinic pilot controls" on public.clinic_pilot_controls for insert to authenticated
with check (private.is_organization_member(organization_id, 'admin') and updated_by = (select auth.uid()));
create policy "admins update clinic pilot controls" on public.clinic_pilot_controls for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin') and updated_by = (select auth.uid()));
