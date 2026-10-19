create or replace function public.get_existing_booking_confirmation(
  p_organization_id uuid,
  p_appointment_id uuid
)
returns table (message_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return query
  select m.id,
    case
      when m.status ? 'read' then 'read'
      when m.status ? 'delivered' then 'delivered'
      when m.status ? 'sent' then 'sent'
      else 'accepted'
    end
  from private.whatsapp_booking_handoffs h
  join public.messages m
    on m.organization_id = h.organization_id
   and m.direction = 'outgoing'
   and m.status->>'source' = 'whatsapp_booking_handoff'
   and m.status->>'handoff_id' = h.id::text
  where h.organization_id = p_organization_id
    and h.appointment_id = p_appointment_id
    and (m.status ? 'accepted' or m.status ? 'sent' or m.status ? 'delivered' or m.status ? 'read')
  order by m.created_at desc
  limit 1;

  if found then return; end if;

  return query
  select e.message_id,
    case
      when e.message_id is not null then 'accepted'
      when e.status = 'failed' then 'failed'
      else 'pending'
    end
  from public.reminder_events e
  where e.organization_id = p_organization_id
    and e.appointment_id = p_appointment_id
    and e.event_type = 'confirmation'
  order by e.created_at desc
  limit 1;
end;
$$;

revoke all on function public.get_existing_booking_confirmation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_existing_booking_confirmation(uuid, uuid) to service_role;
