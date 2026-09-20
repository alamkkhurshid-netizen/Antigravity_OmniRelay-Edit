-- Staff-mediated recovery for exhausted appointment and care reminder jobs.
-- Automated workers keep their existing leases; this adds an audited, tenant-safe
-- way for clinic administrators to release one failed item back to the queue.

create table public.automation_recovery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  job_kind text not null check (job_kind in ('appointment_reminder','care_reminder')),
  job_id uuid not null,
  action text not null check (action in ('manual_retry')),
  reason text not null check (char_length(trim(reason)) between 3 and 240),
  previous_status text not null,
  created_at timestamptz not null default now()
);

create index automation_recovery_events_org_time_idx
  on public.automation_recovery_events (organization_id, created_at desc);

alter table public.automation_recovery_events enable row level security;
grant select on public.automation_recovery_events to authenticated;

create policy "admins read automation recovery audit"
on public.automation_recovery_events for select to authenticated
using (private.is_organization_member(organization_id, 'admin'));

create or replace function public.retry_failed_automation_job(
  p_organization_id uuid,
  p_job_kind text,
  p_job_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  previous_status text;
  affected integer := 0;
  recent_recoveries integer := 0;
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Workspace administrator access required' using errcode = '42501';
  end if;
  if p_job_kind not in ('appointment_reminder','care_reminder') then
    raise exception 'Unsupported automation job type';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception 'A short recovery reason is required';
  end if;

  select count(*) into recent_recoveries
  from public.automation_recovery_events
  where organization_id = p_organization_id
    and actor_user_id = actor
    and created_at >= now() - interval '1 hour';
  if recent_recoveries >= 20 then
    raise exception 'Recovery limit reached. Review the underlying channel issue before retrying again.';
  end if;

  if p_job_kind = 'appointment_reminder' then
    select status into previous_status
    from public.reminder_events
    where id = p_job_id and organization_id = p_organization_id
    for update;

    if previous_status is distinct from 'failed' then
      raise exception 'Only failed appointment reminders can be retried';
    end if;

    update public.reminder_events
    set status = 'scheduled',
        attempts = least(attempts, greatest(max_attempts - 1, 0)),
        next_attempt_at = now(),
        failure_reason = null,
        updated_at = now()
    where id = p_job_id and organization_id = p_organization_id;
    get diagnostics affected = row_count;
  else
    select status into previous_status
    from public.care_reminder_runs
    where id = p_job_id and organization_id = p_organization_id
    for update;

    if previous_status is distinct from 'failed' then
      raise exception 'Only failed care reminders can be retried';
    end if;

    update public.care_reminder_runs
    set status = 'approved',
        attempt_count = least(attempt_count, greatest(max_attempts - 1, 0)),
        next_attempt_at = now(),
        failure_reason = null,
        updated_at = now()
    where id = p_job_id and organization_id = p_organization_id;
    get diagnostics affected = row_count;
  end if;

  if affected <> 1 then
    raise exception 'Automation job was not found';
  end if;

  insert into public.automation_recovery_events (
    organization_id, actor_user_id, job_kind, job_id, action, reason, previous_status
  ) values (
    p_organization_id, actor, p_job_kind, p_job_id, 'manual_retry', trim(p_reason), previous_status
  );

  return jsonb_build_object(
    'ok', true,
    'job_kind', p_job_kind,
    'job_id', p_job_id,
    'released_at', now()
  );
end;
$$;

revoke all on function public.retry_failed_automation_job(uuid,text,uuid,text) from public, anon;
grant execute on function public.retry_failed_automation_job(uuid,text,uuid,text) to authenticated;

comment on function public.retry_failed_automation_job(uuid,text,uuid,text) is
  'Releases one tenant-scoped failed reminder for a single audited manual retry.';
