-- Read-only metadata verification for an isolated OmniRelay restore.
-- This script intentionally reads no application or patient rows.
-- Run after restoring into a non-production target.

begin read only;

select current_setting('server_version') as postgres_version;

select
  count(*) filter (where c.relrowsecurity) as rls_enabled_tables,
  count(*) filter (where not c.relrowsecurity) as rls_disabled_tables,
  count(*) as public_tables
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r';

select
  (select count(*) from pg_policies where schemaname = 'public') as public_policies,
  (select count(*) from pg_trigger where not tgisinternal) as user_triggers,
  (select count(*) from pg_indexes where schemaname = 'public') as public_indexes,
  (select count(*)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public') as public_functions;

select count(*) as applied_migrations,
       min(version) as earliest_migration,
       max(version) as latest_migration
from supabase_migrations.schema_migrations;

select extname, extversion
from pg_extension
order by extname;

rollback;

