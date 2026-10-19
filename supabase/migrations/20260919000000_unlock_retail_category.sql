-- Unlock 'Retail & e-commerce' category for provisioning.
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
  current_user_id uuid;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Enforce single-profile invariant: one email/user account = one business profile
  if exists (
    select 1 from public.agents
    where user_id = current_user_id and not ai
  ) then
    raise exception 'This account is already bound to an existing business profile. Each user account is strictly limited to one clinic profile.';
  end if;

  if length(trim(p_business_name)) < 2 then
    raise exception 'Business name must contain at least 2 characters';
  end if;

  -- Enforce category
  if p_business_category not in ('Healthcare', 'Retail & e-commerce') then
    raise exception 'Only Healthcare and Retail businesses are permitted to provision this CRM system.';
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
      'onboarding_version', 6,
      'onboarding_status', 'completed'
    )
  );

  -- Only perform Healthcare specific logic if Healthcare
  if p_business_category = 'Healthcare' then
    normalized_clinic_mode := coalesce(nullif(trim(p_clinic_mode), ''), 'solo_practitioner');
    if normalized_clinic_mode not in ('solo_practitioner','multi_doctor_clinic','diagnostic_centre') then
      raise exception 'Unsupported clinic operating model';
    end if;

    normalized_provider_name := nullif(trim(p_primary_provider_name), '');
    if length(coalesce(normalized_provider_name, '')) < 2 then
      raise exception 'Enter the first doctor''s full name';
    end if;

    update public.booking_resources
    set name = normalized_provider_name, updated_at = now()
    where organization_id = new_organization_id and name = 'Primary provider';

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
