create table public.whatsapp_recovery_acceptance_fixtures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null unique references public.whatsapp_acceptance_test_runs(id) on delete cascade,
  session_id uuid not null references public.whatsapp_booking_sessions(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  previous_expires_at timestamptz not null,
  status text not null default 'prepared' check (status in ('prepared','passed','failed','expired')),
  prepared_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, session_id)
);

create index whatsapp_recovery_acceptance_fixtures_org_time_idx
  on public.whatsapp_recovery_acceptance_fixtures (organization_id, prepared_at desc);

alter table public.whatsapp_recovery_acceptance_fixtures enable row level security;
revoke all on public.whatsapp_recovery_acceptance_fixtures from anon, authenticated;
grant select on public.whatsapp_recovery_acceptance_fixtures to authenticated;

create policy "clinic admins read recovery fixtures"
on public.whatsapp_recovery_acceptance_fixtures for select to authenticated
using (private.is_organization_member(organization_id, 'admin'));

create or replace function public.prepare_abandoned_recovery_acceptance(
  p_organization_id uuid
)
returns public.whatsapp_acceptance_test_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_message public.messages;
  target_session public.whatsapp_booking_sessions;
  run public.whatsapp_acceptance_test_runs;
begin
  select m.* into verified_message
  from public.messages m
  where m.organization_id = p_organization_id
    and m.direction = 'outgoing'
    and m.service = 'whatsapp'
    and m.status ? 'delivered'
    and m.timestamp >= now() - interval '30 days'
  order by m.timestamp desc
  limit 1;

  if verified_message.id is null then
    raise exception 'A recent delivered WhatsApp record is required' using errcode = '22023';
  end if;

  select s.* into target_session
  from public.whatsapp_booking_sessions s
  where s.organization_id = p_organization_id
    and s.conversation_id = verified_message.conversation_id
  for update;

  if target_session.id is null then
    raise exception 'Open the booking MENU once before preparing recovery acceptance' using errcode = '22023';
  end if;
  if target_session.state <> 'welcome' then
    raise exception 'The verified recipient has an active booking flow; send MENU before preparing this test' using errcode = '22023';
  end if;

  select * into run from private.arm_whatsapp_acceptance_test_from_delivery(
    p_organization_id,
    'abandoned_recovery',
    verified_message.id,
    1
  );

  delete from public.whatsapp_recovery_acceptance_fixtures
  where organization_id = p_organization_id and status <> 'prepared';

  insert into public.whatsapp_recovery_acceptance_fixtures(
    organization_id, run_id, session_id, conversation_id, previous_expires_at,
    status, prepared_at, completed_at
  ) values (
    p_organization_id, run.id, target_session.id, target_session.conversation_id,
    target_session.expires_at, 'prepared', now(), null
  )
  on conflict (organization_id, session_id) do update set
    run_id = excluded.run_id,
    previous_expires_at = excluded.previous_expires_at,
    status = 'prepared',
    prepared_at = now(),
    completed_at = null;

  update public.whatsapp_booking_sessions
  set expires_at = now() - interval '1 minute', updated_at = now()
  where id = target_session.id and organization_id = p_organization_id and state = 'welcome';

  return run;
end;
$$;

create or replace function private.observe_abandoned_recovery_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inbound public.messages;
  run public.whatsapp_acceptance_test_runs;
  fixture public.whatsapp_recovery_acceptance_fixtures;
  normalized_address text;
  current_lease uuid;
begin
  if new.direction <> 'outgoing'
     or new.service <> 'whatsapp'
     or coalesce(new.status->>'source', '') <> 'booking_concierge'
     or lower(coalesce(new.content->>'text', '')) not like '%previous booking session expired%' then
    return new;
  end if;

  select m.* into inbound
  from public.messages m
  where m.organization_id = new.organization_id
    and m.conversation_id = new.conversation_id
    and m.direction = 'incoming'
    and m.service = 'whatsapp'
    and lower(trim(coalesce(m.content->>'text', ''))) = 'menu'
    and m.timestamp <= new.timestamp
  order by m.timestamp desc
  limit 1;
  if inbound.id is null then return new; end if;

  normalized_address := regexp_replace(coalesce(new.contact_address, ''), '\D', '', 'g');
  select r.* into run
  from public.whatsapp_acceptance_test_runs r
  join public.whatsapp_recovery_acceptance_fixtures f on f.run_id = r.id
  where r.organization_id = new.organization_id
    and r.scenario_key = 'abandoned_recovery'
    and r.status = 'armed'
    and r.expires_at > now()
    and r.recipient_hash = extensions.digest(normalized_address, 'sha256')
    and f.conversation_id = new.conversation_id
    and f.status = 'prepared'
  for update of r;

  if run.id is null then return new; end if;

  select f.* into fixture
  from public.whatsapp_recovery_acceptance_fixtures f
  where f.run_id = run.id
    and f.conversation_id = new.conversation_id
    and f.status = 'prepared'
  for update;
  if fixture.id is null then return new; end if;

  current_lease := gen_random_uuid();
  update public.whatsapp_acceptance_test_runs
  set status = 'running', message_count = 1, started_at = now(),
      lease_token = current_lease, dispatch_message_id = new.id, updated_at = now()
  where id = run.id and status = 'armed' and message_count < max_messages;

  update public.whatsapp_recovery_acceptance_fixtures
  set status = 'passed', completed_at = now()
  where id = fixture.id and status = 'prepared';

  perform private.complete_whatsapp_acceptance_test(
    run.id,
    current_lease,
    true,
    'controlled-abandoned-recovery:' || new.id::text,
    null
  );

  return new;
end;
$$;

drop trigger if exists observe_abandoned_recovery_acceptance_after_message on public.messages;
create trigger observe_abandoned_recovery_acceptance_after_message
after insert on public.messages
for each row execute function private.observe_abandoned_recovery_acceptance();

revoke all on function public.prepare_abandoned_recovery_acceptance(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_abandoned_recovery_acceptance(uuid)
  to service_role;
revoke all on function private.observe_abandoned_recovery_acceptance()
  from public, anon, authenticated;
grant execute on function private.observe_abandoned_recovery_acceptance()
  to service_role;
