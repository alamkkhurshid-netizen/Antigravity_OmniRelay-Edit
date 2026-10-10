revoke all on public.production_readiness_checks from public, anon;
grant select, insert, update on public.production_readiness_checks to authenticated;
