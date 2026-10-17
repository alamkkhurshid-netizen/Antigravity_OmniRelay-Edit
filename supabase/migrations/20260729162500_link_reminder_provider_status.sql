create or replace function private.sync_care_reminder_delivery_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.external_id is null then
    return new;
  end if;

  update public.care_reminder_runs
  set
    provider_message_id = coalesce(provider_message_id, new.external_id),
    status = case
      when new.status ? 'read' then 'read'
      when new.status ? 'delivered' then 'delivered'
      when new.status ? 'sent' or new.status ? 'accepted' then 'sent'
      when new.status ? 'failed' then 'failed'
      else status
    end,
    sent_at = coalesce(sent_at, nullif(new.status->>'sent', '')::timestamptz, nullif(new.status->>'accepted', '')::timestamptz),
    delivered_at = coalesce(delivered_at, nullif(new.status->>'delivered', '')::timestamptz),
    read_at = coalesce(read_at, nullif(new.status->>'read', '')::timestamptz),
    failure_reason = case
      when new.status ? 'failed' then coalesce(new.status#>>'{errors,0,error,message}', 'WhatsApp delivery failed')
      else failure_reason
    end,
    provider_response = new.status,
    updated_at = now()
  where provider_message_id = new.external_id
     or provider_response->>'message_id' = new.id::text;

  return new;
end;
$$;

revoke all on function private.sync_care_reminder_delivery_status() from public, anon, authenticated;
