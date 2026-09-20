create or replace function private.observe_pilot_appointment_automation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare event_key text;
begin
  if new.status = 'confirmed' and old.status is distinct from new.status then
    perform private.enqueue_automation_event(
      new.organization_id,
      'booking_confirmed',
      new.id::text || ':' || new.status,
      jsonb_build_object(
        'source', 'appointment',
        'source_id', new.id,
        'status', new.status,
        'starts_at', new.starts_at,
        'location_id', new.location_id,
        'resource_id', new.resource_id
      )
    );
  end if;

  if old.status is distinct from new.status
    or old.starts_at is distinct from new.starts_at
    or old.location_id is distinct from new.location_id
    or old.resource_id is distinct from new.resource_id then
    event_key := new.id::text || ':' || new.status || ':' || new.starts_at::text || ':'
      || coalesce(new.location_id::text, '') || ':' || coalesce(new.resource_id::text, '');
    perform private.enqueue_automation_event(
      new.organization_id,
      'appointment_changed',
      event_key,
      jsonb_build_object(
        'source', 'appointment',
        'source_id', new.id,
        'status', new.status,
        'starts_at', new.starts_at,
        'location_id', new.location_id,
        'resource_id', new.resource_id
      )
    );
  end if;
  return new;
end;
$$;
revoke all on function private.observe_pilot_appointment_automation() from public, anon, authenticated;

create or replace function public.claim_managed_automation_runs(p_limit integer default 10)
returns setof public.automation_runs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return query
  with due as (
    select r.id
    from public.automation_runs r
    join public.automation_workflows w on w.id = r.workflow_id and w.organization_id = r.organization_id
    where r.status in ('queued', 'retrying')
      and coalesce(r.next_attempt_at, r.created_at) <= now()
      and w.status = 'active'
      and w.trigger_key = 'booking_confirmed'
      and w.configuration->>'execution_mode' = 'managed'
      and w.configuration->>'rollout_review' = 'approved'
      and coalesce((w.configuration->>'kill_switch')::boolean, false) = false
    order by coalesce(r.next_attempt_at, r.created_at), r.created_at
    for update of r skip locked
    limit greatest(1, least(p_limit, 20))
  )
  update public.automation_runs r
  set status = 'processing',
      attempt_count = r.attempt_count + 1,
      started_at = now(),
      updated_at = now()
  from due
  where r.id = due.id
  returning r.*;
end;
$$;
revoke all on function public.claim_managed_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.claim_managed_automation_runs(integer) to service_role;

create or replace function public.complete_managed_automation_run(
  p_run_id uuid,
  p_succeeded boolean,
  p_retryable boolean default false,
  p_failure_code text default null,
  p_failure_summary text default null,
  p_observed_message_id uuid default null
)
returns public.automation_runs
language plpgsql
security definer
set search_path = ''
as $$
declare result public.automation_runs;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.automation_runs r
  set status = case
        when p_succeeded then 'succeeded'
        when p_retryable and r.attempt_count < r.max_attempts then 'retrying'
        else 'failed'
      end,
      next_attempt_at = case
        when not p_succeeded and p_retryable and r.attempt_count < r.max_attempts
          then now() + make_interval(mins => least(60, 5 * (2 ^ greatest(0, r.attempt_count - 1))::integer))
        else null
      end,
      completed_at = case
        when p_succeeded or not p_retryable or r.attempt_count >= r.max_attempts then now()
        else null
      end,
      failure_code = case when p_succeeded then null else left(coalesce(p_failure_code, 'execution_error'), 100) end,
      failure_summary = case when p_succeeded then null else left(coalesce(p_failure_summary, 'Managed execution could not be completed.'), 500) end,
      observed_message_id = coalesce(p_observed_message_id, r.observed_message_id),
      delivery_status = case when p_succeeded and p_observed_message_id is not null then 'accepted' else r.delivery_status end,
      updated_at = now()
  where r.id = p_run_id and r.status = 'processing'
  returning * into result;

  if result.id is null then
    raise exception 'Managed automation run is not processing' using errcode = 'P0002';
  end if;
  return result;
end;
$$;
revoke all on function public.complete_managed_automation_run(uuid, boolean, boolean, text, text, uuid) from public, anon, authenticated;
grant execute on function public.complete_managed_automation_run(uuid, boolean, boolean, text, text, uuid) to service_role;

create or replace function public.recover_stale_managed_automation_runs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare recovered integer;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.automation_runs r
  set status = case when r.attempt_count < r.max_attempts then 'retrying' else 'failed' end,
      next_attempt_at = case when r.attempt_count < r.max_attempts then now() else null end,
      completed_at = case when r.attempt_count >= r.max_attempts then now() else null end,
      failure_code = 'worker_timeout',
      failure_summary = 'Managed execution timed out and was recovered safely.',
      updated_at = now()
  from public.automation_workflows w
  where r.workflow_id = w.id
    and r.organization_id = w.organization_id
    and r.status = 'processing'
    and r.started_at < now() - make_interval(secs => w.timeout_seconds);
  get diagnostics recovered = row_count;
  return recovered;
end;
$$;
revoke all on function public.recover_stale_managed_automation_runs() from public, anon, authenticated;
grant execute on function public.recover_stale_managed_automation_runs() to service_role;
