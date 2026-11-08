create or replace function private.claim_due_automation_runs(p_limit integer default 20)
returns setof public.automation_runs language sql security definer set search_path = '' as $$
  with due as (
    select r.id from public.automation_runs r join public.automation_workflows w on w.id=r.workflow_id
    where r.status in ('queued','retrying') and coalesce(r.next_attempt_at,r.created_at)<=now() and w.status='active'
    order by coalesce(r.next_attempt_at,r.created_at),r.created_at for update of r skip locked
    limit greatest(1,least(p_limit,100))
  )
  update public.automation_runs r set status='processing',attempt_count=r.attempt_count+1,started_at=now(),updated_at=now()
  from due where r.id=due.id returning r.*;
$$;
revoke all on function private.claim_due_automation_runs(integer) from public,anon,authenticated;
grant execute on function private.claim_due_automation_runs(integer) to service_role;

create or replace function public.control_automation_run(p_organization_id uuid,p_run_id uuid,p_action text)
returns public.automation_runs language plpgsql security invoker set search_path='' as $$
declare result public.automation_runs;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  if p_action='retry' then
    update public.automation_runs set status='queued',next_attempt_at=now(),failure_code=null,failure_summary=null,completed_at=null,updated_at=now()
    where id=p_run_id and organization_id=p_organization_id and status='failed' and attempt_count<max_attempts returning * into result;
  elsif p_action='cancel' then
    update public.automation_runs set status='cancelled',next_attempt_at=null,completed_at=now(),updated_at=now()
    where id=p_run_id and organization_id=p_organization_id and status in ('queued','retrying') returning * into result;
  else raise exception 'Unsupported automation action'; end if;
  if result.id is null then raise exception 'Automation run cannot be changed'; end if;
  return result;
end; $$;
revoke all on function public.control_automation_run(uuid,uuid,text) from public,anon;
grant execute on function public.control_automation_run(uuid,uuid,text) to authenticated;
