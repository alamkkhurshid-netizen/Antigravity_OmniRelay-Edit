create table public.whatsapp_acceptance_payments(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null unique references public.whatsapp_acceptance_test_runs(id) on delete cascade,
  amount_paise integer not null default 100 check(amount_paise=100),
  currency text not null default 'INR' check(currency='INR'),
  status text not null default 'created' check(status in ('created','paid','failed','expired')),
  provider_order_id text unique,
  provider_payment_id text,
  access_token_hash bytea not null,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_acceptance_payments enable row level security;
revoke all on public.whatsapp_acceptance_payments from anon,authenticated;
grant select on public.whatsapp_acceptance_payments to authenticated;
create policy "clinic admins read acceptance payments" on public.whatsapp_acceptance_payments for select to authenticated
using(private.is_organization_member(organization_id,'admin'));

alter table public.whatsapp_acceptance_test_runs add column subject_acceptance_payment_id uuid references public.whatsapp_acceptance_payments(id) on delete set null;

create or replace function private.reconcile_isolated_acceptance_payment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare run public.whatsapp_acceptance_test_runs;
begin
  if new.status not in ('paid','failed','expired') or new.status is not distinct from old.status then return new; end if;
  select * into run from public.whatsapp_acceptance_test_runs where subject_acceptance_payment_id=new.id and scenario_key='deposit_payment' and status='running' for update;
  if run.id is null then return new; end if;
  perform private.complete_whatsapp_acceptance_test(run.id,run.lease_token,new.status='paid','acceptance-payment:'||new.id::text,case when new.status='paid' then null else 'Synthetic deposit payment ended as '||new.status||'.' end);
  return new;
end;
$$;
create trigger reconcile_isolated_acceptance_payment after update of status on public.whatsapp_acceptance_payments for each row execute function private.reconcile_isolated_acceptance_payment();
revoke all on function private.reconcile_isolated_acceptance_payment() from public,anon,authenticated;

create or replace function public.claim_deposit_acceptance_dispatch(p_organization_id uuid)
returns public.whatsapp_acceptance_test_runs language plpgsql security invoker set search_path=''
as $$
declare result public.whatsapp_acceptance_test_runs;
begin
  update public.whatsapp_acceptance_test_runs set status='running',message_count=message_count+1,started_at=now(),lease_token=gen_random_uuid(),updated_at=now()
  where organization_id=p_organization_id and scenario_key='deposit_payment' and status='armed' and expires_at>now() and message_count<max_messages
    and verified_message_id is not null and (subject_payment_id is not null or subject_acceptance_payment_id is not null)
    and checkout_url ~ '^https://omnirelay-light\.alam-kkhurshid\.chatgpt\.site/' returning * into result;
  if result.id is not null then insert into public.whatsapp_acceptance_test_events(organization_id,run_id,scenario_key,event_type,safe_summary) values(result.organization_id,result.id,result.scenario_key,'claimed','Controlled deposit dispatcher claimed one verified message.'); end if;
  return result;
end;
$$;
