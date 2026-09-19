-- The OpenBSP service role still reads `extra`, while browser roles can only
-- read non-sensitive connection metadata. Existing RLS policies remain intact.
revoke select on table public.organizations_addresses from anon, authenticated;

grant select (organization_id, service, address, status, created_at, updated_at)
  on table public.organizations_addresses to authenticated;

revoke insert, update, delete
  on table public.organizations_addresses from anon, authenticated;
