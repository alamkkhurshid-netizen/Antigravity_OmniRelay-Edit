create table public.automation_rollout_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  decision text not null check (decision in ('approved','blocked')),
  observation_count integer not null check (observation_count >= 0),
  failure_count integer not null check (failure_count >= 0),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  evidence_window_started_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index automation_rollout_reviews_org_time_idx
  on public.automation_rollout_reviews (organization_id, created_at desc);

alter table public.automation_rollout_reviews enable row level security;
revoke all on public.automation_rollout_reviews from anon, authenticated;
grant select on public.automation_rollout_reviews to authenticated;

create policy "admins read automation rollout reviews"
on public.automation_rollout_reviews for select to authenticated
using (private.is_organization_member(organization_id, 'admin'));

create or replace function public.get_automation_rollout_readiness(p_organization_id uuid)
returns table (
  workflow_id uuid,
  trigger_key text,
  observation_count bigint,
  failure_count bigint,
  required_observations integer,
  ready boolean,
  review_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_organization_member(p_organization_id, 'member') then
    raise exception 'Workspace access required' using errcode = '42501';
  end if;

  return query
  select
    w.id,
    w.trigger_key,
    count(r.id) filter (
      where r.created_at >= now() - interval '30 days'
        and r.safe_context->>'execution_mode' = 'observe'
    ),
    count(r.id) filter (
      where r.created_at >= now() - interval '30 days'
        and (r.status = 'failed' or r.delivery_status = 'failed')
    ),
    5,
    count(r.id) filter (
      where r.created_at >= now() - interval '30 days'
        and r.safe_context->>'execution_mode' = 'observe'
    ) >= 5
      and count(r.id) filter (
        where r.created_at >= now() - interval '30 days'
          and (r.status = 'failed' or r.delivery_status = 'failed')
      ) = 0,
    case
      when count(r.id) filter (
        where r.created_at >= now() - interval '30 days'
          and (r.status = 'failed' or r.delivery_status = 'failed')
      ) > 0 then 'blocked'
      when count(r.id) filter (
        where r.created_at >= now() - interval '30 days'
          and r.safe_context->>'execution_mode' = 'observe'
      ) >= 5 then 'ready'
      else 'collecting'
    end
  from public.automation_workflows w
  left join public.automation_runs r
    on r.workflow_id = w.id and r.organization_id = w.organization_id
  where w.organization_id = p_organization_id
    and w.status = 'active'
    and w.configuration->>'execution_mode' = 'observe'
  group by w.id, w.trigger_key
  order by w.trigger_key;
end;
$$;

revoke all on function public.get_automation_rollout_readiness(uuid) from public, anon;
grant execute on function public.get_automation_rollout_readiness(uuid) to authenticated;

create or replace function public.approve_automation_rollout(
  p_organization_id uuid,
  p_workflow_id uuid
)
returns public.automation_rollout_reviews
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  assessment record;
  result public.automation_rollout_reviews;
begin
  if actor is null or not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  perform 1
  from public.automation_workflows
  where id = p_workflow_id
    and organization_id = p_organization_id
    and status = 'active'
    and configuration->>'execution_mode' = 'observe'
  for update;
  if not found then
    raise exception 'Observe-only workflow not found' using errcode = 'P0002';
  end if;

  select * into assessment
  from public.get_automation_rollout_readiness(p_organization_id)
  where workflow_id = p_workflow_id;

  if assessment.ready is distinct from true then
    insert into public.automation_rollout_reviews (
      organization_id, workflow_id, decision, observation_count, failure_count,
      actor_user_id, evidence_window_started_at
    ) values (
      p_organization_id, p_workflow_id, 'blocked',
      coalesce(assessment.observation_count, 0), coalesce(assessment.failure_count, 0),
      actor, now() - interval '30 days'
    ) returning * into result;
    return result;
  end if;

  update public.automation_workflows
  set configuration = configuration || jsonb_build_object(
    'rollout_review', 'approved',
    'rollout_reviewed_at', now(),
    'rollout_reviewed_by', actor
  ), updated_at = now()
  where id = p_workflow_id and organization_id = p_organization_id;

  insert into public.automation_rollout_reviews (
    organization_id, workflow_id, decision, observation_count, failure_count,
    actor_user_id, evidence_window_started_at
  ) values (
    p_organization_id, p_workflow_id, 'approved',
    assessment.observation_count, assessment.failure_count,
    actor, now() - interval '30 days'
  ) returning * into result;
  return result;
end;
$$;

revoke all on function public.approve_automation_rollout(uuid, uuid) from public, anon;
grant execute on function public.approve_automation_rollout(uuid, uuid) to authenticated;
