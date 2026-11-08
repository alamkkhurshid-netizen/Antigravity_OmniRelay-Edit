alter table public.automation_workflows drop constraint if exists automation_workflows_trigger_key_check;
alter table public.automation_workflows add constraint automation_workflows_trigger_key_check
  check (trigger_key in ('booking_created','booking_confirmed','appointment_changed','appointment_reminder','medication_reminder','emergency_notice','follow_up_due','doctor_queue'));

create or replace function private.enqueue_automation_event(
  p_organization_id uuid,p_trigger_key text,p_event_key text,p_safe_context jsonb default '{}'::jsonb
)
returns integer language plpgsql security definer set search_path='' as $$
declare inserted_count integer;
begin
  insert into public.automation_runs(organization_id,workflow_id,trigger_key,idempotency_key,status,max_attempts,next_attempt_at,safe_context)
  select w.organization_id,w.id,w.trigger_key,p_trigger_key||':'||p_event_key,'queued',w.max_attempts,now(),coalesce(p_safe_context,'{}'::jsonb)
  from public.automation_workflows w
  where w.organization_id=p_organization_id and w.trigger_key=p_trigger_key and w.status='active'
  on conflict (organization_id,idempotency_key) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end; $$;
revoke all on function private.enqueue_automation_event(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.enqueue_automation_event(uuid,text,text,jsonb) to service_role;

insert into public.automation_workflows(organization_id,name,trigger_key,status,max_attempts,timeout_seconds,configuration)
select o.id,x.name,x.trigger_key,'paused',3,30,jsonb_build_object('managed_by','omnirelay','version',1,'rollout','staged')
from public.organizations o cross join (values
  ('New booking intake','booking_created'),('Booking confirmation','booking_confirmed'),
  ('Appointment change','appointment_changed'),('Appointment reminder','appointment_reminder'),
  ('Medication reminder','medication_reminder'),('Emergency notice','emergency_notice'),
  ('Follow-up due','follow_up_due'),('Doctor queue notification','doctor_queue')
) as x(name,trigger_key)
on conflict (organization_id,trigger_key,name) do nothing;
