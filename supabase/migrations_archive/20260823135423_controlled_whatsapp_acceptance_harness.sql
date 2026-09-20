create table public.whatsapp_acceptance_test_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scenario_key text not null check (scenario_key in ('deposit_payment','commands_handoff','abandoned_recovery')),
  status text not null default 'draft' check (status in ('draft','armed','running','passed','failed','cancelled','expired')),
  recipient_hash bytea,
  recipient_last4 text check (recipient_last4 is null or recipient_last4 ~ '^[0-9]{4}$'),
  synthetic_label text not null default 'OmniRelay acceptance test',
  max_messages integer not null default 1 check (max_messages between 1 and 3),
  message_count integer not null default 0 check (message_count >= 0),
  expires_at timestamptz,
  failure_summary text,
  evidence_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, scenario_key)
);

create index whatsapp_acceptance_test_runs_org_status_idx on public.whatsapp_acceptance_test_runs(organization_id,status,updated_at desc);
alter table public.whatsapp_acceptance_test_runs enable row level security;
revoke all on public.whatsapp_acceptance_test_runs from anon,authenticated;
grant select on public.whatsapp_acceptance_test_runs to authenticated;
create policy "clinic admins read acceptance test runs" on public.whatsapp_acceptance_test_runs for select to authenticated
using (private.is_organization_member(organization_id,'admin'));

create or replace function private.arm_whatsapp_acceptance_test(p_organization_id uuid,p_scenario_key text,p_recipient_hash bytea,p_recipient_last4 text,p_max_messages integer default 1)
returns public.whatsapp_acceptance_test_runs language plpgsql security definer set search_path='' as $$
declare result public.whatsapp_acceptance_test_runs;
begin
  if p_scenario_key not in ('deposit_payment','commands_handoff','abandoned_recovery') or p_recipient_hash is null or p_recipient_last4 !~ '^[0-9]{4}$' or p_max_messages not between 1 and 3 then raise exception 'Invalid controlled test request' using errcode='22023'; end if;
  insert into public.whatsapp_acceptance_test_runs(organization_id,scenario_key,status,recipient_hash,recipient_last4,max_messages,message_count,expires_at,updated_at)
  values(p_organization_id,p_scenario_key,'armed',p_recipient_hash,p_recipient_last4,p_max_messages,0,now()+interval '30 minutes',now())
  on conflict(organization_id,scenario_key) do update set status='armed',recipient_hash=excluded.recipient_hash,recipient_last4=excluded.recipient_last4,max_messages=excluded.max_messages,message_count=0,expires_at=excluded.expires_at,failure_summary=null,evidence_reference=null,completed_at=null,updated_at=now()
  returning * into result; return result;
end; $$;

create or replace function private.cancel_whatsapp_acceptance_tests(p_organization_id uuid)
returns integer language plpgsql security definer set search_path='' as $$ declare affected integer; begin
  update public.whatsapp_acceptance_test_runs set status='cancelled',completed_at=now(),updated_at=now()
  where organization_id=p_organization_id and status in ('armed','running'); get diagnostics affected=row_count; return affected;
end; $$;

create or replace function private.claim_whatsapp_acceptance_test(p_organization_id uuid,p_scenario_key text)
returns public.whatsapp_acceptance_test_runs language plpgsql security definer set search_path='' as $$ declare result public.whatsapp_acceptance_test_runs; begin
  update public.whatsapp_acceptance_test_runs set status='expired',completed_at=now(),updated_at=now() where organization_id=p_organization_id and status='armed' and expires_at<=now();
  update public.whatsapp_acceptance_test_runs set status='running',message_count=message_count+1,updated_at=now()
  where organization_id=p_organization_id and scenario_key=p_scenario_key and status='armed' and expires_at>now() and message_count<max_messages
  returning * into result;
  if result.id is null then raise exception 'Controlled test is not armed or has reached its message limit' using errcode='P0002'; end if; return result;
end; $$;

revoke all on function private.arm_whatsapp_acceptance_test(uuid,text,bytea,text,integer) from public,anon,authenticated;
revoke all on function private.cancel_whatsapp_acceptance_tests(uuid) from public,anon,authenticated;
revoke all on function private.claim_whatsapp_acceptance_test(uuid,text) from public,anon,authenticated;
grant execute on function private.arm_whatsapp_acceptance_test(uuid,text,bytea,text,integer) to service_role;
grant execute on function private.cancel_whatsapp_acceptance_tests(uuid) to service_role;
grant execute on function private.claim_whatsapp_acceptance_test(uuid,text) to service_role;
