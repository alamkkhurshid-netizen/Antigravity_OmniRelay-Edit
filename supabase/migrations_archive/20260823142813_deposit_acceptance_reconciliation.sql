alter table public.whatsapp_acceptance_test_runs
  add column subject_payment_id uuid references public.booking_payments(id) on delete restrict;

create or replace function private.attach_deposit_acceptance_payment(
  p_run_id uuid,
  p_lease_token uuid,
  p_payment_id uuid
)
returns public.whatsapp_acceptance_test_runs
language plpgsql
security definer
set search_path=''
as $$
declare result public.whatsapp_acceptance_test_runs;
begin
  update public.whatsapp_acceptance_test_runs r
  set subject_payment_id=p_payment_id,updated_at=now()
  where r.id=p_run_id and r.scenario_key='deposit_payment'
    and r.status='running' and r.lease_token=p_lease_token
    and exists(
      select 1 from public.booking_payments p
      where p.id=p_payment_id and p.organization_id=r.organization_id
        and p.payment_mode='deposit_online'
        and p.status in ('pending','paid','failed','expired')
        and p.metadata->>'synthetic_acceptance'='true'
    )
  returning * into result;
  if result.id is null then raise exception 'Deposit acceptance payment could not be attached' using errcode='P0001'; end if;
  return result;
end;
$$;

create or replace function private.reconcile_deposit_acceptance_payment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare run public.whatsapp_acceptance_test_runs;
begin
  if new.status not in ('paid','failed','expired') or new.status is not distinct from old.status then return new; end if;
  select * into run from public.whatsapp_acceptance_test_runs
  where subject_payment_id=new.id and scenario_key='deposit_payment' and status='running'
  for update;
  if run.id is null then return new; end if;
  perform private.complete_whatsapp_acceptance_test(
    run.id,run.lease_token,new.status='paid',
    'deposit-payment:'||new.id::text,
    case when new.status='paid' then null else 'Synthetic deposit payment ended as '||new.status||'.' end
  );
  return new;
end;
$$;

drop trigger if exists reconcile_deposit_acceptance_payment on public.booking_payments;
create trigger reconcile_deposit_acceptance_payment
after update of status on public.booking_payments
for each row execute function private.reconcile_deposit_acceptance_payment();

revoke all on function private.attach_deposit_acceptance_payment(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.attach_deposit_acceptance_payment(uuid,uuid,uuid) to service_role;
revoke all on function private.reconcile_deposit_acceptance_payment() from public,anon,authenticated;
