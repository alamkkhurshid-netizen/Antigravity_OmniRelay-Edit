create or replace function private.sync_care_reminder_run_from_message()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  provider_status text;
begin
  provider_status := lower(coalesce(new.status ->> 'status', ''));

  if provider_status not in ('sent', 'delivered', 'read', 'failed') then
    return new;
  end if;

  update public.care_reminder_runs
  set
    provider_message_id = coalesce(new.external_id, provider_message_id),
    status = provider_status,
    sent_at = case
      when provider_status in ('sent', 'delivered', 'read') then coalesce(sent_at, now())
      else sent_at
    end,
    delivered_at = case
      when provider_status in ('delivered', 'read') then coalesce(delivered_at, now())
      else delivered_at
    end,
    read_at = case
      when provider_status = 'read' then coalesce(read_at, now())
      else read_at
    end,
    failed_at = case
      when provider_status = 'failed' then coalesce(failed_at, now())
      else null
    end,
    failure_reason = case
      when provider_status = 'failed'
        then coalesce(new.status ->> 'error_message', new.status ->> 'error', 'WhatsApp delivery failed')
      else null
    end,
    updated_at = now()
  where
    (new.external_id is not null and provider_message_id = new.external_id)
    or provider_response ->> 'message_id' = new.id::text;

  return new;
end;
$$;

