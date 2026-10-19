alter table public.doctor_queue_dispatches
  add column if not exists provider_message_id text,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz;

create index if not exists doctor_queue_dispatches_provider_message_idx
  on public.doctor_queue_dispatches (provider_message_id)
  where provider_message_id is not null;

create or replace function private.sync_doctor_queue_dispatch_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.doctor_queue_dispatches d
  set
    provider_message_id=coalesce(new.external_id,d.provider_message_id),
    status=case
      when new.status ? 'read' then 'read'
      when new.status ? 'delivered' then 'delivered'
      when new.status ? 'sent' or new.status ? 'accepted' then 'sent'
      when new.status ? 'failed' then 'failed'
      else d.status
    end,
    sent_at=coalesce(d.sent_at,nullif(new.status->>'sent','')::timestamptz,nullif(new.status->>'accepted','')::timestamptz),
    delivered_at=coalesce(d.delivered_at,nullif(new.status->>'delivered','')::timestamptz),
    read_at=coalesce(d.read_at,nullif(new.status->>'read','')::timestamptz),
    failure_reason=case when new.status ? 'failed' then coalesce(new.status#>>'{errors,0,error,message}','WhatsApp delivery failed') else d.failure_reason end,
    provider_response=new.status,
    next_attempt_at=case when new.status ? 'failed' and d.attempts<d.max_attempts then now()+interval '10 minutes' else d.next_attempt_at end,
    updated_at=now()
  where d.message_id=new.id or (new.external_id is not null and d.provider_message_id=new.external_id);
  return new;
end;
$function$;

drop trigger if exists sync_doctor_queue_dispatch_from_message on public.messages;
create trigger sync_doctor_queue_dispatch_from_message
after insert or update of external_id,status on public.messages
for each row execute function private.sync_doctor_queue_dispatch_from_message();

revoke all on function private.sync_doctor_queue_dispatch_from_message() from public,anon,authenticated;
grant execute on function private.sync_doctor_queue_dispatch_from_message() to service_role;
