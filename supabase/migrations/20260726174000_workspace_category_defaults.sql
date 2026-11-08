-- Category-aware starter location and service defaults for new workspaces.

create or replace function private.initialize_omnirelay_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  business_category text := coalesce(new.extra->>'business_category', 'Other');
  location_count integer := greatest(1, least(coalesce((new.extra->>'location_count')::integer, 1), 5));
  workspace_timezone text := coalesce(new.extra->>'timezone', 'Asia/Kolkata');
  inferred_location_type text;
  starter_service_name text;
  location_label text;
begin
  inferred_location_type := case
    when business_category = 'Healthcare' then 'chamber'
    when business_category = 'Restaurants & hospitality' then 'restaurant'
    else 'branch'
  end;
  starter_service_name := case business_category
    when 'Healthcare' then 'Consultation'
    when 'Restaurants & hospitality' then 'Reservation'
    when 'Coaching & education' then 'Counselling session'
    when 'Beauty & wellness' then 'Service appointment'
    when 'Real estate' then 'Property consultation'
    when 'Automotive services' then 'Service booking'
    when 'Home services' then 'Service visit'
    else 'Discovery call'
  end;
  location_label := case business_category
    when 'Healthcare' then 'Chamber'
    when 'Restaurants & hospitality' then 'Restaurant'
    when 'Coaching & education' then 'Centre'
    when 'Beauty & wellness' then 'Outlet'
    else 'Location'
  end;

  insert into public.onboarding_profiles (
    organization_id, business_category, business_name, timezone, services_offered
  ) values (
    new.id, business_category, new.name, workspace_timezone, jsonb_build_array(starter_service_name)
  ) on conflict (organization_id) do nothing;

  insert into public.business_locations (
    organization_id, name, location_type, timezone, created_by
  )
  select new.id, location_label || ' ' || series_number, inferred_location_type,
    workspace_timezone, (select auth.uid())
  from generate_series(1, location_count) as series_number
  on conflict (organization_id, name) do nothing;

  insert into public.organization_services (
    organization_id, name, service_type, duration_minutes
  ) values (
    new.id, starter_service_name, lower(replace(business_category, ' ', '_')),
    case when business_category = 'Restaurants & hospitality' then 90 else 30 end
  ) on conflict (organization_id, name) do nothing;

  insert into public.entitlements (
    organization_id, plan_id, max_workspaces, max_seats, conversations_quota,
    channels, features, white_label, status, trial_started_at, trial_ends_at
  ) values (
    new.id, 'launch', 1, 2, 500, '["whatsapp"]'::jsonb,
    '["appointments","basic_rag","starter_workflows"]'::jsonb,
    false, 'trialing', now(), now() + interval '7 days'
  ) on conflict (organization_id) do nothing;

  return new;
end;
$$;

revoke all on function private.initialize_omnirelay_workspace()
  from public, anon, authenticated;
