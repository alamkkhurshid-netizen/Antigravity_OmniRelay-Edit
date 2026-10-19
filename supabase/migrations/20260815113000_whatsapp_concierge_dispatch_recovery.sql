-- Durable, bounded recovery for inbound WhatsApp concierge dispatches.
-- The message row remains the idempotency key; successful processing is proven by
-- whatsapp_booking_sessions.last_message_id before another attempt is dispatched.

create table public.whatsapp_concierge_dispatches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null unique references public.messages(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processed','exhausted')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  request_id bigint,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index whatsapp_concierge_dispatches_retry_idx
  on public.whatsapp_concierge_dispatches (status, next_attempt_at)
  where status = 'pending';
create index whatsapp_concierge_dispatches_org_time_idx
  on public.whatsapp_concierge_dispatches (organization_id, created_at desc);

alter table public.whatsapp_concierge_dispatches enable row level security;
grant select on public.whatsapp_concierge_dispatches to authenticated;

create policy "members read concierge dispatch health"
on public.whatsapp_concierge_dispatches for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create or replace function private.dispatch_whatsapp_concierge_job(p_dispatch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_row public.whatsapp_concierge_dispatches%rowtype;
  new_request_id bigint;
begin
  select * into dispatch_row
  from public.whatsapp_concierge_dispatches
  where id = p_dispatch_id and status = 'pending'
  for update skip locked;

  if not found or dispatch_row.attempts >= 3 then
    return;
  end if;

  new_request_id := net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_url') || '/whatsapp-booking-concierge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_token')
    ),
    body := jsonb_build_object('message_id', dispatch_row.message_id),
    timeout_milliseconds := 10000
  );

  update public.whatsapp_concierge_dispatches
  set attempts = attempts + 1,
      request_id = new_request_id,
      next_attempt_at = now() + make_interval(secs => 15 * (2 ^ attempts)::integer),
      last_error = null,
      updated_at = now()
  where id = p_dispatch_id;
exception when others then
  update public.whatsapp_concierge_dispatches
  set last_error = left(sqlerrm, 500),
      next_attempt_at = now() + interval '15 seconds',
      updated_at = now()
  where id = p_dispatch_id;
end;
$$;

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
  from public.whatsapp_booking_sessions s
  where d.status = 'pending'
    and s.organization_id = d.organization_id
    and s.conversation_id = d.conversation_id
    and s.last_message_id = d.message_id;

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

create or replace function private.invoke_whatsapp_booking_concierge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_id uuid;
begin
  if new.direction <> 'incoming' or new.service::text <> 'whatsapp' then
    return new;
  end if;

  insert into public.whatsapp_concierge_dispatches (
    organization_id, conversation_id, message_id
  ) values (
    new.organization_id, new.conversation_id, new.id
  )
  on conflict (message_id) do nothing
  returning id into dispatch_id;

  if dispatch_id is not null then
    perform private.dispatch_whatsapp_concierge_job(dispatch_id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

revoke execute on function private.dispatch_whatsapp_concierge_job(uuid) from public, anon, authenticated;
revoke execute on function private.process_whatsapp_concierge_dispatches() from public, anon, authenticated;
revoke execute on function private.invoke_whatsapp_booking_concierge() from public, anon, authenticated;
grant execute on function private.dispatch_whatsapp_concierge_job(uuid) to service_role;
grant execute on function private.process_whatsapp_concierge_dispatches() to service_role;
grant execute on function private.invoke_whatsapp_booking_concierge() to service_role;

select cron.schedule(
  'process-whatsapp-concierge-dispatches',
  '15 seconds',
  'select private.process_whatsapp_concierge_dispatches();'
);

select cron.schedule(
  'cleanup-whatsapp-concierge-dispatches',
  '17 3 * * *',
  $$delete from public.whatsapp_concierge_dispatches where created_at < now() - interval '30 days'$$
);
