alter function public.prepare_deposit_acceptance_test(uuid) security definer;
alter function public.prepare_deposit_acceptance_test(uuid) set search_path = '';

revoke all on function public.prepare_deposit_acceptance_test(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_deposit_acceptance_test(uuid)
  to service_role;
