create table public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 100),
  trigger_key text not null check (trigger_key in ('booking_created','booking_confirmed','appointment_changed','appointment_reminder','medication_reminder','emergency_notice','follow_up_due')),
  execution_provider text not null default 'internal' check (execution_provider in ('internal','n8n')),
  external_workflow_id text,
  status text not null default 'draft' check (status in ('draft','active','paused','error')),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  timeout_seconds integer not null default 30 check (timeout_seconds between 5 and 300),
  configuration jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, trigger_key, name)
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  trigger_key text not null,
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued','processing','succeeded','retrying','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  failure_summary text check (failure_summary is null or char_length(failure_summary) <= 500),
  provider_execution_id text,
  safe_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index automation_workflows_org_status_idx on public.automation_workflows (organization_id, status, trigger_key);
create index automation_runs_due_idx on public.automation_runs (status, next_attempt_at) where status in ('queued','retrying');
create index automation_runs_org_created_idx on public.automation_runs (organization_id, created_at desc);

alter table public.automation_workflows enable row level security;
alter table public.automation_runs enable row level security;

create policy "members read automation workflows" on public.automation_workflows
for select to authenticated using (private.is_organization_member(organization_id, 'member'));

create policy "admins create automation workflows" on public.automation_workflows
for insert to authenticated with check (private.is_organization_member(organization_id, 'admin') and created_by = (select auth.uid()));

create policy "admins update automation workflows" on public.automation_workflows
for update to authenticated using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));

create policy "owners delete automation workflows" on public.automation_workflows
for delete to authenticated using (private.is_organization_member(organization_id, 'owner'));

create policy "members read automation runs" on public.automation_runs
for select to authenticated using (private.is_organization_member(organization_id, 'member'));

create policy "admins update automation runs" on public.automation_runs
for update to authenticated using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));

revoke all on public.automation_workflows, public.automation_runs from anon;
grant select, insert, update, delete on public.automation_workflows to authenticated;
grant select, update on public.automation_runs to authenticated;
