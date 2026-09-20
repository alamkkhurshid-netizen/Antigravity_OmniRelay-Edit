create table public.action_centre_assignments(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_kind text not null check(item_kind in ('booking_approval','waitlist','schedule_disruption','care_retry','appointment_retry','care_task')),
  subject_id uuid not null,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'claimed' check(status in ('claimed','reviewed','released')),
  assigned_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(organization_id,item_kind,subject_id)
);

create index action_centre_assignments_org_status_idx on public.action_centre_assignments(organization_id,status,updated_at desc);
alter table public.action_centre_assignments enable row level security;
revoke all on public.action_centre_assignments from public,anon;
grant select,insert,update on public.action_centre_assignments to authenticated;

create policy "members read action ownership" on public.action_centre_assignments for select to authenticated
using(private.is_organization_member(organization_id,'member'));
create policy "admins coordinate action ownership" on public.action_centre_assignments for all to authenticated
using(private.is_organization_member(organization_id,'admin'))
with check(private.is_organization_member(organization_id,'admin') and (assigned_to is null or assigned_to=auth.uid()));

comment on table public.action_centre_assignments is 'Coordination-only ownership for heterogeneous clinic exceptions; never mutates the underlying clinical or booking record.';
