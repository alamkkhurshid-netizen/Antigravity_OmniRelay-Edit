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
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if length(trim(p_business_name)) < 2 then
    raise exception 'Business name must contain at least 2 characters';
  end if;

  if p_business_category not in ('Healthcare', 'Hospitality', 'Professional services') then
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
      'onboarding_version', 2,
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

