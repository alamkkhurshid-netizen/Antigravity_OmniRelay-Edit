create or replace function private.observe_pilot_appointment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'confirmed' then
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
  return new;
end;
$$;

drop trigger if exists observe_pilot_appointment_insert on public.appointments;
create trigger observe_pilot_appointment_insert
after insert on public.appointments
for each row execute function private.observe_pilot_appointment_insert();

revoke all on function private.observe_pilot_appointment_insert() from public, anon, authenticated;

insert into public.automation_runs (
  organization_id, workflow_id, trigger_key, idempotency_key, status,
  max_attempts, completed_at, safe_context, source_type, source_id,
  observed_message_id, delivery_status
)
select
  w.organization_id,
  w.id,
  w.trigger_key,
  'booking_confirmed:' || a.id::text || ':' || a.status,
  'succeeded',
  w.max_attempts,
  coalesce((m.status->>'delivered')::timestamptz, m.created_at),
  jsonb_build_object(
    'source', 'appointment',
    'source_id', a.id,
    'status', a.status,
    'starts_at', a.starts_at,
    'location_id', a.location_id,
    'resource_id', a.resource_id,
    'execution_mode', 'observe',
    'evidence', 'delivered_booking_handoff'
  ),
  'appointment',
  a.id,
  m.id,
  case when m.status ? 'read' then 'read' else 'delivered' end
from public.automation_workflows w
join public.appointments a
  on a.organization_id = w.organization_id
 and a.status = 'confirmed'
 and a.source = 'whatsapp'
 and a.created_at >= now() - interval '30 days'
join private.whatsapp_booking_handoffs h
  on h.organization_id = a.organization_id
 and h.appointment_id = a.id
join public.messages m
  on m.organization_id = a.organization_id
 and m.direction = 'outgoing'
 and m.status->>'source' = 'whatsapp_booking_handoff'
 and m.status->>'handoff_id' = h.id::text
 and m.status ? 'delivered'
where w.trigger_key = 'booking_confirmed'
  and w.status = 'active'
  and w.configuration->>'execution_mode' = 'observe'
on conflict (organization_id, idempotency_key) do update
set observed_message_id = excluded.observed_message_id,
    delivery_status = excluded.delivery_status,
    safe_context = excluded.safe_context,
    completed_at = excluded.completed_at,
    updated_at = now();
