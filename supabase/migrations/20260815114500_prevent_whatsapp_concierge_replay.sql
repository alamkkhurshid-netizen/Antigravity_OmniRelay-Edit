-- A later successfully processed inbound message supersedes every earlier message
-- in the same conversation. This prevents a durable retry from replaying an old
-- menu choice against a newer concierge state.

create or replace function private.process_whatsapp_concierge_dispatches()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_row record;
begin
  update public.whatsapp_concierge_dispatches d
  set status = 'processed', processed_at = now(), updated_at = now(), last_error = null
  from public.whatsapp_booking_sessions s,
       public.messages processed_message,
       public.messages dispatched_message
  where d.status = 'pending'
    and s.organization_id = d.organization_id
    and s.conversation_id = d.conversation_id
    and processed_message.id = s.last_message_id
    and dispatched_message.id = d.message_id
    and processed_message.organization_id = d.organization_id
    and processed_message.conversation_id = d.conversation_id
    and dispatched_message.organization_id = d.organization_id
    and dispatched_message.conversation_id = d.conversation_id
    and processed_message.created_at >= dispatched_message.created_at;

  update public.whatsapp_concierge_dispatches d
  set last_error = left(coalesce(r.error_msg, 'HTTP ' || r.status_code::text), 500),
      updated_at = now()
  from net._http_response r
  where d.status = 'pending'
    and d.request_id = r.id
    and (r.error_msg is not null or r.status_code >= 400);

  update public.whatsapp_concierge_dispatches
  set status = 'exhausted',
      last_error = coalesce(last_error, 'Concierge dispatch did not complete after 3 attempts'),
      updated_at = now()
  where status = 'pending' and attempts >= 3 and next_attempt_at <= now();

  for dispatch_row in
    select id
    from public.whatsapp_concierge_dispatches
    where status = 'pending' and attempts < 3 and next_attempt_at <= now()
    order by next_attempt_at
    limit 25
    for update skip locked
  loop
    perform private.dispatch_whatsapp_concierge_job(dispatch_row.id);
  end loop;
end;
$$;

revoke execute on function private.process_whatsapp_concierge_dispatches() from public, anon, authenticated;
grant execute on function private.process_whatsapp_concierge_dispatches() to service_role;

-- Reconcile jobs accumulated while the worker is paused, then resume it.
select private.process_whatsapp_concierge_dispatches();
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'process-whatsapp-concierge-dispatches'),
  active := true
);
