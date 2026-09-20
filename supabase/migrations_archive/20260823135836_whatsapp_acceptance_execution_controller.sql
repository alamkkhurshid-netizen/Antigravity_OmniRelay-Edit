alter table public.whatsapp_acceptance_test_runs add column started_at timestamptz, add column lease_token uuid;
create table public.whatsapp_acceptance_test_events(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,run_id uuid not null references public.whatsapp_acceptance_test_runs(id) on delete cascade,scenario_key text not null,event_type text not null check(event_type in ('claimed','passed','failed','expired')),safe_summary text,created_at timestamptz not null default now());
create index whatsapp_acceptance_test_events_org_time_idx on public.whatsapp_acceptance_test_events(organization_id,created_at desc);
alter table public.whatsapp_acceptance_test_events enable row level security;
revoke all on public.whatsapp_acceptance_test_events from anon,authenticated;
grant select on public.whatsapp_acceptance_test_events to authenticated;
create policy "clinic admins read acceptance test audit" on public.whatsapp_acceptance_test_events for select to authenticated using(private.is_organization_member(organization_id,'admin'));

create or replace function private.claim_whatsapp_acceptance_test(p_organization_id uuid,p_scenario_key text)
returns public.whatsapp_acceptance_test_runs language plpgsql security definer set search_path='' as $$ declare result public.whatsapp_acceptance_test_runs; begin
  update public.whatsapp_acceptance_test_runs set status='expired',completed_at=now(),updated_at=now() where organization_id=p_organization_id and status='armed' and expires_at<=now();
  update public.whatsapp_acceptance_test_runs set status='running',message_count=message_count+1,started_at=now(),lease_token=gen_random_uuid(),updated_at=now() where organization_id=p_organization_id and scenario_key=p_scenario_key and status='armed' and expires_at>now() and message_count<max_messages returning * into result;
  if result.id is null then raise exception 'Controlled test is not armed or has reached its message limit' using errcode='P0002'; end if;
  insert into public.whatsapp_acceptance_test_events(organization_id,run_id,scenario_key,event_type,safe_summary) values(result.organization_id,result.id,result.scenario_key,'claimed','Controlled synthetic test claimed within its bounded lease.'); return result;
end; $$;

create or replace function private.complete_whatsapp_acceptance_test(p_run_id uuid,p_lease_token uuid,p_passed boolean,p_evidence_reference text,p_failure_summary text default null)
returns public.whatsapp_acceptance_test_runs language plpgsql security definer set search_path='' as $$ declare result public.whatsapp_acceptance_test_runs;gate_key text;summary text; begin
  update public.whatsapp_acceptance_test_runs set status=case when p_passed then 'passed' else 'failed' end,evidence_reference=left(nullif(trim(p_evidence_reference),''),200),failure_summary=case when p_passed then null else left(coalesce(nullif(trim(p_failure_summary),''),'Controlled test failed.'),500) end,completed_at=now(),lease_token=null,updated_at=now() where id=p_run_id and status='running' and lease_token=p_lease_token and message_count<=max_messages returning * into result;
  if result.id is null then raise exception 'Controlled test lease is invalid or already completed' using errcode='P0002'; end if;
  gate_key:=case result.scenario_key when 'deposit_payment' then 'payments' when 'commands_handoff' then 'reminders_commands_handoff' when 'abandoned_recovery' then 'abandoned_recovery' end;
  summary:=case when p_passed then 'Controlled synthetic '||replace(result.scenario_key,'_',' ')||' test passed.' else result.failure_summary end;
  perform private.record_whatsapp_booking_acceptance(result.organization_id,gate_key,case when p_passed then 'passed' else 'failed' end,'controlled_channel',summary,result.evidence_reference);
  insert into public.whatsapp_acceptance_test_events(organization_id,run_id,scenario_key,event_type,safe_summary) values(result.organization_id,result.id,result.scenario_key,case when p_passed then 'passed' else 'failed' end,summary); return result;
end; $$;

create or replace function private.recover_stale_whatsapp_acceptance_tests() returns integer language plpgsql security definer set search_path='' as $$ declare affected integer; begin
  with stale as(update public.whatsapp_acceptance_test_runs set status='failed',failure_summary='Controlled test lease timed out.',completed_at=now(),lease_token=null,updated_at=now() where status='running' and started_at<now()-interval '10 minutes' returning *) insert into public.whatsapp_acceptance_test_events(organization_id,run_id,scenario_key,event_type,safe_summary) select organization_id,id,scenario_key,'failed','Controlled test lease timed out.' from stale;
  get diagnostics affected=row_count; return affected;
end; $$;
revoke all on function private.claim_whatsapp_acceptance_test(uuid,text) from public,anon,authenticated;
revoke all on function private.complete_whatsapp_acceptance_test(uuid,uuid,boolean,text,text) from public,anon,authenticated;
revoke all on function private.recover_stale_whatsapp_acceptance_tests() from public,anon,authenticated;
grant execute on function private.claim_whatsapp_acceptance_test(uuid,text) to service_role;
grant execute on function private.complete_whatsapp_acceptance_test(uuid,uuid,boolean,text,text) to service_role;
grant execute on function private.recover_stale_whatsapp_acceptance_tests() to service_role;
