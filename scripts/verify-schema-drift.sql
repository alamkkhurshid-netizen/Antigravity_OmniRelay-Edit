SELECT json_build_object(
  'applied_migrations_count', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'earliest_migration', (SELECT min(version) FROM supabase_migrations.schema_migrations),
  'latest_migration', (SELECT max(version) FROM supabase_migrations.schema_migrations),
  'public_tables_count', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'),
  'rls_enabled_tables_count', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity),
  'public_policies_count', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
  'public_functions_count', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'),
  'public_indexes_count', (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'),
  'billing_tables_count', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'billing' AND c.relkind = 'r'),
  'private_tables_count', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'private' AND c.relkind = 'r'),
  'missing_canonical_tables', (
    SELECT coalesce(json_agg(t), '[]'::json) FROM (
      SELECT unnest(ARRAY[
        'voice_service_nonces',
        'durable_api_rate_limits',
        'system_runtime_controls',
        'appointments',
        'organizations',
        'booking_resources',
        'business_locations',
        'organization_services',
        'retail_orders',
        'provider_location_assignments',
        'provider_location_services'
      ]) AS t
      EXCEPT
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    ) missing
  ),
  'missing_canonical_rpcs', (
    SELECT coalesce(json_agg(f), '[]'::json) FROM (
      SELECT unnest(ARRAY[
        'consume_voice_request_nonce',
        'consume_durable_rate_limit',
        'set_runtime_control',
        'get_public_booking_slots',
        'create_whatsapp_booking_handoff',
        'complete_whatsapp_booking_handoff'
      ]) AS f
      EXCEPT
      SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
    ) missing_rpcs
  )
) AS canonical_schema_baseline_audit;
