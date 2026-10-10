-- Provider-level WhatsApp delivery observability and repeated-failure alerts.

create unique index if not exists operational_events_whatsapp_message_failure_idx
  on public.operational_events ((metadata->>'message_id'))
  where event_source = 'whatsapp_delivery' and metadata ? 'message_id';

create or replace function private.capture_whatsapp_delivery_failure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider_error jsonb;
  provider_code text;
  safe_message text;
  recent_failures integer;
begin
  if new.direction::text <> 'outgoing'
    or not (coalesce(new.status, '{}'::jsonb) ? 'failed')
    or (tg_op = 'UPDATE' and coalesce(old.status, '{}'::jsonb) ? 'failed') then
    return new;
  end if;

  provider_error := coalesce(new.status->'errors'->0->'error', new.status->'errors'->0, '{}'::jsonb);
  provider_code := left(coalesce(provider_error->>'code', 'provider_error'), 100);
  safe_message := case provider_code
    when '131047' then 'WhatsApp blocked a free-form reply because the 24-hour customer-service window is closed.'
    when '131030' then 'The recipient is not enabled for the connected Meta test number.'
    when '131026' then 'WhatsApp could not deliver to the recipient.'
    when '131042' then 'The WhatsApp Business billing setup needs attention.'
    when '131048' then 'Meta temporarily limited message activity for sender quality protection.'
    when '131049' then 'Meta delivery pacing temporarily withheld the message.'
    when '130429' then 'The WhatsApp Cloud API rate limit was reached.'
    when '80007' then 'The Meta business account rate limit was reached.'
    when '132000' then 'The approved template variable count does not match.'
    when '132001' then 'The approved template or language was not found.'
    when '132012' then 'A template parameter does not match the approved format.'
    when '190' then 'The connected Meta access token is invalid or expired.'
    when '10' then 'The connected Meta account is missing a required permission.'
    when '200' then 'The connected Meta account is missing a required permission.'
    when '100' then 'Meta rejected an invalid recipient or template field.'
    else 'Meta returned a WhatsApp delivery error that needs staff review.'
  end;

  insert into public.operational_events (
    organization_id, event_source, severity, error_code, safe_message, metadata
  ) values (
    new.organization_id,
    'whatsapp_delivery',
    case when provider_code in ('190','10','200','131042') then 'critical' else 'error' end,
    provider_code,
    safe_message,
    jsonb_build_object('message_id', new.id, 'conversation_id', new.conversation_id, 'provider_code', provider_code)
  ) on conflict do nothing;

  select count(*) into recent_failures
  from public.operational_events e
  where e.organization_id = new.organization_id
    and e.event_source = 'whatsapp_delivery'
    and e.created_at >= now() - interval '15 minutes';

  if recent_failures >= 3 then
    insert into public.app_notifications (
      organization_id, recipient_user_id, notification_type, title, body,
      href, entity_type, entity_id
    )
    select
      new.organization_id,
      a.user_id,
      'system',
      'Repeated WhatsApp delivery failures',
      recent_failures || ' delivery failures were recorded in the last 15 minutes. Review provider diagnostics before retrying.',
      '/app/operations',
      'whatsapp_delivery_cluster',
      new.id
    from public.agents a
    where a.organization_id = new.organization_id
      and a.ai = false
      and a.user_id is not null
      and coalesce(a.extra->>'role', 'member') in ('owner','admin')
      and coalesce(a.extra->>'status', 'active') <> 'inactive'
      and not exists (
        select 1 from public.app_notifications n
        where n.organization_id = new.organization_id
          and n.recipient_user_id = a.user_id
          and n.entity_type = 'whatsapp_delivery_cluster'
          and n.created_at >= now() - interval '1 hour'
      );
  end if;

  return new;
end;
$$;

revoke all on function private.capture_whatsapp_delivery_failure() from public, anon, authenticated;

drop trigger if exists capture_whatsapp_delivery_failure on public.messages;
create trigger capture_whatsapp_delivery_failure
after insert or update of status on public.messages
for each row execute function private.capture_whatsapp_delivery_failure();
