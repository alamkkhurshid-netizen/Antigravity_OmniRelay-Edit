-- OmniRelay workspace foundation: richer profiles and broad business taxonomy.

alter table public.onboarding_profiles
  add column if not exists description text,
  add column if not exists primary_phone text,
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists working_hours jsonb not null default
    '{"mon":{"enabled":true,"open":"09:00","close":"18:00"},"tue":{"enabled":true,"open":"09:00","close":"18:00"},"wed":{"enabled":true,"open":"09:00","close":"18:00"},"thu":{"enabled":true,"open":"09:00","close":"18:00"},"fri":{"enabled":true,"open":"09:00","close":"18:00"},"sat":{"enabled":true,"open":"09:00","close":"14:00"},"sun":{"enabled":false,"open":"09:00","close":"14:00"}}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.organization_services
  add column if not exists description text,
  add column if not exists buffer_minutes integer not null default 0
    check (buffer_minutes between 0 and 240),
  add column if not exists booking_enabled boolean not null default true;

create or replace function public.complete_workspace_onboarding(
  p_business_name text,
  p_business_category text,
  p_location_count integer default 1,
  p_timezone text default 'Asia/Kolkata'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_organization_id uuid;
  normalized_location_count integer;
  allowed_categories constant text[] := array[
    'Healthcare', 'Restaurants & hospitality', 'Coaching & education',
    'Beauty & wellness', 'Professional services', 'Real estate',
    'Automotive services', 'Retail & e-commerce', 'Home services', 'Other'
  ];
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(p_business_name)) < 2 then
    raise exception 'Business name must contain at least 2 characters';
  end if;
  if not (p_business_category = any(allowed_categories)) then
    raise exception 'Unsupported business category';
  end if;

  normalized_location_count := greatest(1, least(coalesce(p_location_count, 1), 5));
  new_organization_id := gen_random_uuid();

  insert into public.organizations (id, name, extra)
  values (
    new_organization_id,
    trim(p_business_name),
    jsonb_build_object(
      'business_category', p_business_category,
      'location_count', normalized_location_count,
      'timezone', coalesce(nullif(trim(p_timezone), ''), 'Asia/Kolkata'),
      'onboarding_version', 3,
      'onboarding_status', 'completed'
    )
  );
  return new_organization_id;
end;
$$;

revoke all on function public.complete_workspace_onboarding(text, text, integer, text)
  from public, anon;
grant execute on function public.complete_workspace_onboarding(text, text, integer, text)
  to authenticated;
