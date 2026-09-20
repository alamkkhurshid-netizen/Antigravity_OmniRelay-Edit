create or replace function public.is_oem_operator()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_platform_operator();
$$;

revoke all on function public.is_oem_operator() from public, anon;
grant execute on function public.is_oem_operator() to authenticated;

