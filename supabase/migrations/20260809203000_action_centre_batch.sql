create table public.action_centre_deployments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  status text not null default 'deployed' check (status in ('deployed','partial','failed')),
  deployed_count integer not null default 0 check (deployed_count >= 0),
  automatic_count integer not null default 0 check (automatic_count >= 0),
  exception_count integer not null default 0 check (exception_count >= 0),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index action_centre_deployments_org_time_idx
  on public.action_centre_deployments (organization_id, created_at desc);

alter table public.action_centre_deployments enable row level security;
grant select, insert on public.action_centre_deployments to authenticated;

create policy "members read action centre deployments"
on public.action_centre_deployments for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins create action centre deployments"
on public.action_centre_deployments for insert to authenticated
with check (
  private.is_organization_member(organization_id, 'admin')
  and actor_user_id = (select auth.uid())
);

create or replace function public.deploy_due_clinic_actions(p_organization_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  deployed integer := 0;
  automatic integer := 0;
  exceptions integer := 0;
  deployment_id uuid;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required';
  end if;

  with eligible as (
    select run.id
    from public.care_reminder_runs run
    join public.patient_profiles patient on patient.id = run.patient_id
    where run.organization_id = p_organization_id
      and run.channel = 'whatsapp'
      and run.scheduled_for <= now()
      and (
        run.status = 'ready'
        or (run.status = 'failed' and run.attempt_count < run.max_attempts)
      )
      and patient.care_communications_consent
      and nullif(regexp_replace(coalesce(patient.phone, ''), '\D', '', 'g'), '') is not null
    for update of run skip locked
  ), approved as (
    update public.care_reminder_runs run
    set status = 'approved',
        approved_by = actor,
        approved_at = now(),
        next_attempt_at = now(),
        failure_reason = null,
        updated_at = now()
    from eligible
    where run.id = eligible.id
    returning run.id
  )
  select count(*)::integer into deployed from approved;

  select (
    (select count(*) from public.care_reminder_runs
      where organization_id = p_organization_id
        and status = 'approved' and scheduled_for <= now())
    +
    (select count(*) from public.reminder_events
      where organization_id = p_organization_id
        and status = 'scheduled'
        and coalesce(next_attempt_at, scheduled_for) <= now())
  )::integer into automatic;

  select (
    (select count(*) from public.care_reminder_runs run
      join public.patient_profiles patient on patient.id = run.patient_id
      where run.organization_id = p_organization_id
        and run.scheduled_for <= now()
        and (
          (run.status = 'failed' and run.attempt_count >= run.max_attempts)
          or run.status = 'skipped'
          or not patient.care_communications_consent
          or nullif(regexp_replace(coalesce(patient.phone, ''), '\D', '', 'g'), '') is null
        ))
    +
    (select count(*) from public.reminder_events
      where organization_id = p_organization_id and status = 'failed')
    +
    (select count(*) from public.patient_care_tasks
      where organization_id = p_organization_id
        and status in ('open','in_progress')
        and (priority in ('high','urgent') or due_at <= now()))
  )::integer into exceptions;

  insert into public.action_centre_deployments (
    organization_id, actor_user_id, status, deployed_count,
    automatic_count, exception_count, snapshot
  ) values (
    p_organization_id, actor,
    case when exceptions > 0 then 'partial' else 'deployed' end,
    deployed, automatic, exceptions,
    jsonb_build_object(
      'deployed_at', now(),
      'routine_actions_released', deployed,
      'automatic_actions_due', automatic,
      'exceptions_retained', exceptions
    )
  ) returning id into deployment_id;

  return jsonb_build_object(
    'deployment_id', deployment_id,
    'deployed_count', deployed,
    'automatic_count', automatic,
    'exception_count', exceptions
  );
end;
$$;

revoke all on function public.deploy_due_clinic_actions(uuid) from public, anon;
grant execute on function public.deploy_due_clinic_actions(uuid) to authenticated;
