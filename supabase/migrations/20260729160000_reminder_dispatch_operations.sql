alter table public.care_reminder_runs
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists provider_response jsonb not null default '{}'::jsonb,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledgement text;

alter table public.care_reminder_runs
  add constraint care_reminder_runs_attempts_valid
  check (attempt_count >= 0 and max_attempts between 1 and 5);

create index if not exists care_reminder_runs_dispatch_idx
  on public.care_reminder_runs (status, next_attempt_at, scheduled_for)
  where status in ('approved', 'failed');

create index if not exists care_reminder_runs_provider_message_idx
  on public.care_reminder_runs (provider_message_id)
  where provider_message_id is not null;

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
  where provider_message_id = new.external_id;

  return new;
end;
$$;

revoke all on function private.sync_care_reminder_delivery_status() from public, anon, authenticated;

drop trigger if exists sync_care_reminder_delivery_status on public.messages;
create trigger sync_care_reminder_delivery_status
after insert or update of status, external_id on public.messages
for each row execute function private.sync_care_reminder_delivery_status();

select cron.schedule(
  'dispatch-care-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_url') || '/care-reminder-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_token')
    ),
    body := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 10000
  );
  $$
);

