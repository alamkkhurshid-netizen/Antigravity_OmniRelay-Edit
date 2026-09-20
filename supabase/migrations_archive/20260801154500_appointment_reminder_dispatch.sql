alter table public.reminder_events
  add column if not exists message_id uuid references public.messages(id) on delete set null,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  add column if not exists failure_reason text;

create index if not exists reminder_events_due_dispatch
  on public.reminder_events (scheduled_for, next_attempt_at)
  where channel = 'whatsapp' and status = 'scheduled';

create or replace function public.claim_due_appointment_reminders(p_limit integer default 20)
returns setof public.reminder_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select r.id
    from public.reminder_events r
    where r.channel = 'whatsapp'
      and r.status = 'scheduled'
      and r.scheduled_for <= now()
      and coalesce(r.next_attempt_at, r.scheduled_for) <= now()
      and r.attempts < r.max_attempts
    order by r.scheduled_for
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.reminder_events r
  set status = 'processing',
      attempts = r.attempts + 1,
      last_attempt_at = now(),
      failure_reason = null,
      updated_at = now()
  from due
  where r.id = due.id
  returning r.*;
end;
$$;

revoke all on function public.claim_due_appointment_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_appointment_reminders(integer) to service_role;

create or replace function private.sync_reminder_event_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  update public.reminder_events r
  set provider_message_id = coalesce(new.external_id, r.provider_message_id),
      sent_at = case when new.status ? 'sent' or new.status ? 'accepted' then coalesce(r.sent_at, v_now) else r.sent_at end,
      delivered_at = case when new.status ? 'delivered' then coalesce(r.delivered_at, v_now) else r.delivered_at end,
      read_at = case when new.status ? 'read' then coalesce(r.read_at, v_now) else r.read_at end,
      status = case when new.status ? 'failed' then 'failed' else 'sent' end,
      failure_reason = case when new.status ? 'failed' then coalesce(new.status->'errors'->0->>'message', 'WhatsApp rejected the message.') else null end,
      provider_response = coalesce(r.provider_response, '{}'::jsonb) || jsonb_build_object('message_status', new.status),
      updated_at = v_now
  where r.message_id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_reminder_event_from_message on public.messages;
create trigger sync_reminder_event_from_message
after update of external_id, status on public.messages
for each row execute function private.sync_reminder_event_from_message();

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'dispatch-appointment-reminders') then
    perform cron.schedule(
      'dispatch-appointment-reminders',
      '* * * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_url') || '/appointment-reminder-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_token')
        ),
        body := jsonb_build_object('scheduled_at', now()),
        timeout_milliseconds := 10000
      );
      $job$
    );
  end if;
end
$$;
