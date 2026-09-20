create or replace function public.get_public_booking_page(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'slug',bp.slug,'headline',bp.headline,'description',coalesce(bp.description,op.description),'accent_color',bp.accent_color,
    'clinic_mode',coalesce(op.clinic_mode,'solo_practitioner'),
    'business',jsonb_build_object('name',coalesce(op.business_name,o.name),'category',op.business_category,'phone',op.primary_phone,'email',op.email,'timezone',coalesce(op.timezone,'Asia/Kolkata')),
    'departments',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'description',d.description) order by d.sort_order,d.name) from public.clinic_departments d where d.organization_id=o.id and d.active),'[]'::jsonb),
    'provider_departments',coalesce((select jsonb_agg(jsonb_build_object('department_id',pd.department_id,'resource_id',pd.resource_id,'primary_department',pd.primary_department)) from public.provider_departments pd join public.clinic_departments d on d.id=pd.department_id and d.organization_id=pd.organization_id and d.active where pd.organization_id=o.id),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'type',l.location_type,'address',l.address,'phone',l.phone,'timezone',l.timezone) order by l.created_at) from public.business_locations l where l.organization_id=o.id and l.active),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'duration_minutes',s.duration_minutes,'buffer_minutes',s.buffer_minutes,'price_paise',s.price_paise,'currency',s.currency) order by s.created_at) from public.organization_services s where s.organization_id=o.id and s.active and s.booking_enabled),'[]'::jsonb),
    'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'type',r.resource_type,'location_id',r.location_id,'timezone',r.timezone,'photo_path',pp.photo_path,'specialization',pp.specialization,'qualifications',pp.qualifications,'experience_years',pp.experience_years,'languages',pp.languages,'biography',pp.biography) order by r.created_at) from public.booking_resources r left join public.provider_profiles pp on pp.resource_id=r.id where r.organization_id=o.id and r.active),'[]'::jsonb),
    'payments_enabled',exists(select 1 from public.payment_gateway_connections g where g.organization_id=o.id and g.provider='razorpay' and g.status in ('test','live')),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'resource_id',a.resource_id,'location_id',a.location_id,'effective_from',a.effective_from,'effective_to',a.effective_to,'booking_window_days',a.booking_window_days,
      'services',coalesce((select jsonb_agg(jsonb_build_object('service_id',x.service_id,'duration_minutes',coalesce(x.duration_minutes,s.duration_minutes),'buffer_minutes',coalesce(x.buffer_minutes,s.buffer_minutes),'price_paise',coalesce(x.price_paise,s.price_paise),'payment_mode',x.payment_mode,'allowed_payment_modes',x.allowed_payment_modes,'deposit_paise',x.deposit_paise)) from public.provider_location_services x join public.organization_services s on s.id=x.service_id where x.assignment_id=a.id and x.active),'[]'::jsonb)
    ) order by a.created_at) from public.provider_location_assignments a where a.organization_id=o.id and a.active),'[]'::jsonb)
  ) into result
  from public.booking_pages bp join public.organizations o on o.id=bp.organization_id left join public.onboarding_profiles op on op.organization_id=o.id
  where bp.slug=lower(trim(p_slug)) and bp.active;
  if result is null then raise exception 'Booking page not found'; end if;
  return result;
end;
$$;

grant execute on function public.get_public_booking_page(text) to anon,authenticated;

comment on function public.get_public_booking_page(text) is 'Public booking catalogue including tenant-safe clinic mode and department navigation; excludes private provider contacts.';
