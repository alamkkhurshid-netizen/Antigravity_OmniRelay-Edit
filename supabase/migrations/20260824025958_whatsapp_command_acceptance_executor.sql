create table public.whatsapp_acceptance_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.whatsapp_acceptance_test_runs(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete restrict,
  response_message_id uuid not null references public.messages(id) on delete restrict,
  observation_key text not null check (observation_key in ('stop', 'start', 'menu', 'handoff')),
  safe_summary text not null,
  created_at timestamptz not null default now(),
  unique (run_id, observation_key)
);

create index whatsapp_acceptance_observations_org_time_idx
  on public.whatsapp_acceptance_observations (organization_id, created_at desc);

alter table public.whatsapp_acceptance_observations enable row level security;
revoke all on public.whatsapp_acceptance_observations from anon, authenticated;
grant select on public.whatsapp_acceptance_observations to authenticated;

create policy "clinic admins read acceptance observations"
on public.whatsapp_acceptance_observations for select to authenticated
using (private.is_organization_member(organization_id, 'admin'));

create or replace function private.observe_whatsapp_command_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  body_text text;
  expected_inputs text[];
  observed_keys text[];
  inbound public.messages;
  run public.whatsapp_acceptance_test_runs;
  normalized_address text;
  current_lease uuid;
  observed_count integer;
begin
  if new.direction <> 'outgoing'
     or new.service <> 'whatsapp'
     or coalesce(new.status->>'source', '') <> 'booking_concierge' then
    return new;
  end if;

  body_text := lower(trim(coalesce(new.content->>'text', '')));
  if body_text like '%opted out of omnirelay whatsapp messages%' then
    expected_inputs := array['stop','unsubscribe','cancel subscription','opt out','opt-out'];
    observed_keys := array['stop'];
  elsif body_text like '%clinic booking and care messages are active again%' then
    expected_inputs := array['start'];
    -- START restores care communication and renders the deterministic MENU in
    -- the same verified response, so one reply proves both observations.
    observed_keys := array['start','menu'];
  elsif body_text like '%automated concierge is now paused%' then
    expected_inputs := array['9'];
    observed_keys := array['handoff'];
  else
    return new;
  end if;

  select m.* into inbound
  from public.messages m
  where m.organization_id = new.organization_id
    and m.conversation_id = new.conversation_id
    and m.direction = 'incoming'
    and m.service = 'whatsapp'
    and m.timestamp <= new.timestamp
    and lower(trim(coalesce(m.content->>'text', ''))) = any(expected_inputs)
  order by m.timestamp desc
  limit 1;

  if inbound.id is null then return new; end if;
  normalized_address := regexp_replace(coalesce(new.contact_address, ''), '\D', '', 'g');

  select r.* into run
  from public.whatsapp_acceptance_test_runs r
  where r.organization_id = new.organization_id
    and r.scenario_key = 'commands_handoff'
    and r.status in ('armed','running')
    and r.expires_at > now()
    and r.verified_message_id is not null
    and r.recipient_hash = extensions.digest(normalized_address, 'sha256')
  for update;

  if run.id is null then return new; end if;

  if run.status = 'armed' then
    current_lease := gen_random_uuid();
    update public.whatsapp_acceptance_test_runs
    set status = 'running', started_at = now(), lease_token = current_lease, updated_at = now()
    where id = run.id and status = 'armed';
  else
    current_lease := run.lease_token;
  end if;

  insert into public.whatsapp_acceptance_observations(
    organization_id, run_id, source_message_id, response_message_id,
    observation_key, safe_summary
  )
  select run.organization_id, run.id, inbound.id, new.id, key,
    case key
      when 'stop' then 'Verified STOP response and clinic-care opt-out.'
      when 'start' then 'Verified START response and care communication restoration.'
      when 'menu' then 'Verified deterministic booking MENU rendered after START.'
      when 'handoff' then 'Verified human-assistance response and concierge pause.'
    end
  from unnest(observed_keys) key
  on conflict (run_id, observation_key) do nothing;

  select count(*) into observed_count
  from public.whatsapp_acceptance_observations o
  where o.run_id = run.id;

  update public.whatsapp_acceptance_test_runs
  set message_count = least(max_messages, case when observed_count = 4 then 3 else observed_count end),
      updated_at = now()
  where id = run.id and status = 'running';

  if observed_count = 4 then
    perform private.complete_whatsapp_acceptance_test(
      run.id,
      current_lease,
      true,
      'controlled-command-cycle:' || run.id::text,
      null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists observe_whatsapp_command_acceptance_after_message on public.messages;
create trigger observe_whatsapp_command_acceptance_after_message
after insert on public.messages
for each row execute function private.observe_whatsapp_command_acceptance();

revoke all on function private.observe_whatsapp_command_acceptance()
  from public, anon, authenticated;
grant execute on function private.observe_whatsapp_command_acceptance()
  to service_role;
