-- Enable real-time publication for operational_usage_events so the client can receive live updates
-- for the Analytical Dashboard's WhatsApp counter.
begin;

  -- Ensure the table exists in the supabase_realtime publication
  do $$
  begin
    if not exists (
      select 1 
      from pg_publication_tables 
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'operational_usage_events'
    ) then
      alter publication supabase_realtime add table public.operational_usage_events;
    end if;
  end;
  $$;

commit;
