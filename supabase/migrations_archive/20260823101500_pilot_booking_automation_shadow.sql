create or replace function private.enqueue_automation_event(
  p_organization_id uuid,p_trigger_key text,p_event_key text,p_safe_context jsonb default '{}'::jsonb
)
returns integer language plpgsql security definer set search_path='' as $$
declare inserted_count integer;
begin
  insert into public.automation_runs(
    organization_id,workflow_id,trigger_key,idempotency_key,status,max_attempts,next_attempt_at,
    completed_at,safe_context
  )
  select w.organization_id,w.id,w.trigger_key,p_trigger_key||':'||p_event_key,
    case when w.configuration->>'execution_mode'='observe' then 'succeeded' else 'queued' end,
    w.max_attempts,
    case when w.configuration->>'execution_mode'='observe' then null else now() end,
    case when w.configuration->>'execution_mode'='observe' then now() else null end,
    coalesce(p_safe_context,'{}'::jsonb)||jsonb_build_object('execution_mode',coalesce(w.configuration->>'execution_mode','managed'))
  from public.automation_workflows w
  where w.organization_id=p_organization_id and w.trigger_key=p_trigger_key and w.status='active'
  on conflict (organization_id,idempotency_key) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end; $$;
revoke all on function private.enqueue_automation_event(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.enqueue_automation_event(uuid,text,text,jsonb) to service_role;

update public.automation_workflows w
set status='active',configuration=w.configuration||jsonb_build_object('execution_mode','observe','rollout','pilot'),updated_at=now()
where w.trigger_key in ('booking_confirmed','appointment_changed')
  and exists (
    select 1 from public.organizations_addresses oa
    where oa.organization_id=w.organization_id and oa.service='whatsapp' and oa.status='connected'
  );

create or replace function private.observe_pilot_appointment_automation() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_key text;
begin
  if new.status='confirmed' and old.status is distinct from new.status then
    perform private.enqueue_automation_event(
      new.organization_id,'booking_confirmed',new.id::text||':'||new.status,
      jsonb_build_object('source','appointment','status',new.status,'starts_at',new.starts_at,
        'location_id',new.location_id,'resource_id',new.resource_id)
    );
  end if;
  if old.status is distinct from new.status or old.starts_at is distinct from new.starts_at
    or old.location_id is distinct from new.location_id or old.resource_id is distinct from new.resource_id then
    event_key:=new.id::text||':'||new.status||':'||new.starts_at::text||':'||coalesce(new.location_id::text,'')||':'||coalesce(new.resource_id::text,'');
    perform private.enqueue_automation_event(
      new.organization_id,'appointment_changed',event_key,
      jsonb_build_object('source','appointment','status',new.status,'starts_at',new.starts_at,
        'location_id',new.location_id,'resource_id',new.resource_id)
    );
  end if;
  return new;
end; $$;

drop trigger if exists observe_pilot_appointment_automation on public.appointments;
create trigger observe_pilot_appointment_automation
after update of status,starts_at,location_id,resource_id on public.appointments
for each row execute function private.observe_pilot_appointment_automation();

revoke all on function private.observe_pilot_appointment_automation() from public,anon,authenticated;
