-- A clinic's provider name is a patient-facing identity, never a placeholder.
-- Defaults preserve existing callers; the onboarding UI supplies both values for Healthcare.
create or replace function public.complete_workspace_onboarding(
  p_business_name text,
  p_business_category text,
  p_location_count integer default 1,
  p_timezone text default 'Asia/Kolkata',
  p_clinic_mode text default null,
  p_primary_provider_name text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_organization_id uuid;
  normalized_location_count integer;
  normalized_provider_name text;
  normalized_clinic_mode text;
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
  normalized_clinic_mode := case when p_business_category = 'Healthcare'
    then coalesce(nullif(trim(p_clinic_mode), ''), 'solo_practitioner') else null end;
  if normalized_clinic_mode is not null and normalized_clinic_mode not in ('solo_practitioner','multi_doctor_clinic','diagnostic_centre') then
    raise exception 'Unsupported clinic operating model';
  end if;
  normalized_provider_name := nullif(trim(p_primary_provider_name), '');
  if p_business_category = 'Healthcare' and length(coalesce(normalized_provider_name, '')) < 2 then
    raise exception 'Enter the first doctor''s full name';
  end if;

  new_organization_id := gen_random_uuid();
  insert into public.organizations (id, name, extra)
  values (
    new_organization_id,
    trim(p_business_name),
    jsonb_build_object(
      'business_category', p_business_category,
      'location_count', normalized_location_count,
      'timezone', coalesce(nullif(trim(p_timezone), ''), 'Asia/Kolkata'),
      'onboarding_version', 4,
      'onboarding_status', 'completed'
    )
  );

  if normalized_provider_name is not null then
    update public.booking_resources
    set name = normalized_provider_name, updated_at = now()
    where organization_id = new_organization_id and name = 'Primary provider';
  end if;
  if normalized_clinic_mode is not null then
    update public.onboarding_profiles
    set clinic_mode = normalized_clinic_mode, updated_at = now()
    where organization_id = new_organization_id;
  end if;
  return new_organization_id;
end;
$$;

revoke all on function public.complete_workspace_onboarding(text, text, integer, text, text, text)
  from public, anon;
grant execute on function public.complete_workspace_onboarding(text, text, integer, text, text, text)
  to authenticated;
