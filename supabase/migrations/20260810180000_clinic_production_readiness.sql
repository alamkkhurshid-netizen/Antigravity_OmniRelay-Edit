create table public.production_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  check_key text not null check (check_key in ('backup_export','restore_drill','pilot_signoff')),
  status text not null default 'pending' check (status in ('pending','ready','blocked')),
  notes text check (notes is null or char_length(trim(notes)) between 3 and 500),
  evidence_at timestamptz,
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, check_key)
);

create index production_readiness_checks_org_idx
  on public.production_readiness_checks (organization_id, check_key);

alter table public.production_readiness_checks enable row level security;
revoke all on public.production_readiness_checks from public, anon;
grant select, insert, update on public.production_readiness_checks to authenticated;

create policy "members read production readiness"
on public.production_readiness_checks for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins create production readiness evidence"
on public.production_readiness_checks for insert to authenticated
with check (
  private.is_organization_member(organization_id, 'admin')
  and updated_by = (select auth.uid())
);

create policy "admins update production readiness evidence"
on public.production_readiness_checks for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (
  private.is_organization_member(organization_id, 'admin')
  and updated_by = (select auth.uid())
);

comment on table public.production_readiness_checks is
  'Tenant-scoped owner evidence for backup, restore-drill and clinic pilot go-live gates.';

alter table public.team_audit_events
  drop constraint if exists team_audit_events_event_type_check;
alter table public.team_audit_events
  add constraint team_audit_events_event_type_check check (event_type in (
    'invitation_created','invitation_delivered','invitation_revoked',
    'member_role_changed','member_deactivated','member_reactivated',
    'production_readiness_updated'
  ));
