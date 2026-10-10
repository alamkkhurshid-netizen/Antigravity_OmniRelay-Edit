create or replace function private.managed_booking_rollout_ready(
  p_organization_id uuid,
  p_workflow_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.automation_workflows w
      where w.id = p_workflow_id
        and w.organization_id = p_organization_id
        and w.trigger_key = 'booking_confirmed'
        and w.status = 'active'
        and w.configuration->>'rollout_review' = 'approved'
    )
    and private.whatsapp_booking_acceptance_ready(p_organization_id)
    and (
      select count(*) >= 5
      from public.automation_runs r
      where r.workflow_id = p_workflow_id
        and r.organization_id = p_organization_id
        and r.created_at >= now() - interval '30 days'
        and r.safe_context->>'execution_mode' = 'observe'
    )
    and not exists (
      select 1
      from public.automation_runs r
      where r.workflow_id = p_workflow_id
        and r.organization_id = p_organization_id
        and r.created_at >= now() - interval '30 days'
        and (r.status = 'failed' or r.delivery_status = 'failed')
    );
$$;

revoke all on function private.managed_booking_rollout_ready(uuid, uuid) from public, anon, authenticated;
grant execute on function private.managed_booking_rollout_ready(uuid, uuid) to service_role;

create or replace function public.enable_managed_booking_canary(
  p_organization_id uuid,
  p_workflow_id uuid
)
returns public.automation_workflows
language plpgsql
security definer
set search_path = ''
as $$
declare result public.automation_workflows;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if not private.managed_booking_rollout_ready(p_organization_id, p_workflow_id) then
    raise exception 'Managed booking canary readiness requirements are not met' using errcode = '55000';
  end if;

  update public.automation_workflows
  set configuration = configuration || jsonb_build_object(
        'execution_mode', 'managed',
        'managed_canary', true,
        'kill_switch', false,
        'managed_enabled_at', now()
      ),
      updated_at = now()
  where id = p_workflow_id
    and organization_id = p_organization_id
    and trigger_key = 'booking_confirmed'
  returning * into result;

  if result.id is null then
    raise exception 'Booking confirmation workflow not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke all on function public.enable_managed_booking_canary(uuid, uuid) from public, anon, authenticated;
grant execute on function public.enable_managed_booking_canary(uuid, uuid) to service_role;

create or replace function public.disable_managed_booking_canary(
  p_organization_id uuid,
  p_workflow_id uuid
)
returns public.automation_workflows
language plpgsql
security definer
set search_path = ''
as $$
declare result public.automation_workflows;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.automation_workflows
  set configuration = configuration || jsonb_build_object(
        'execution_mode', 'observe',
        'managed_canary', false,
        'kill_switch', true,
        'managed_disabled_at', now()
      ),
      updated_at = now()
  where id = p_workflow_id
    and organization_id = p_organization_id
    and trigger_key = 'booking_confirmed'
  returning * into result;

  if result.id is null then
    raise exception 'Booking confirmation workflow not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke all on function public.disable_managed_booking_canary(uuid, uuid) from public, anon, authenticated;
grant execute on function public.disable_managed_booking_canary(uuid, uuid) to service_role;

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
      and coalesce((w.configuration->>'managed_canary')::boolean, false) = true
      and coalesce((w.configuration->>'kill_switch')::boolean, false) = false
      and private.managed_booking_rollout_ready(w.organization_id, w.id)
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
