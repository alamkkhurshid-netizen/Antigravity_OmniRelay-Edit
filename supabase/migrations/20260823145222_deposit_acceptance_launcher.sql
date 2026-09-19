create or replace function public.prepare_deposit_acceptance_test(p_organization_id uuid)
returns public.whatsapp_acceptance_test_runs
language plpgsql security invoker set search_path=''
as $$
declare bound_message_id uuid; result public.whatsapp_acceptance_test_runs;
begin
  select verified_message_id into bound_message_id from public.whatsapp_acceptance_test_runs
  where organization_id=p_organization_id and scenario_key='deposit_payment' for update;
  if bound_message_id is null then raise exception 'A delivery-verified test recipient must be bound first' using errcode='P0001'; end if;
  select * into result from private.arm_whatsapp_acceptance_test_from_delivery(p_organization_id,'deposit_payment',bound_message_id,1);
  return result;
end;
$$;
revoke all on function public.prepare_deposit_acceptance_test(uuid) from public,anon,authenticated;
grant execute on function public.prepare_deposit_acceptance_test(uuid) to service_role;
