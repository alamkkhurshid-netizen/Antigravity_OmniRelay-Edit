alter table public.provider_location_services
  add column allowed_payment_modes text[] not null default array['pay_at_location']::text[];

update public.provider_location_services
set allowed_payment_modes = array[payment_mode]::text[];

alter table public.provider_location_services drop constraint provider_location_services_deposit;
alter table public.provider_location_services
  add constraint provider_location_services_allowed_payment_modes check (
    cardinality(allowed_payment_modes) > 0
    and allowed_payment_modes <@ array['pay_at_location','full_online','deposit_online']::text[]
    and payment_mode = any(allowed_payment_modes)
  ),
  add constraint provider_location_services_deposit check (
    ('deposit_online' = any(allowed_payment_modes) and deposit_paise is not null and deposit_paise > 0)
    or (not ('deposit_online' = any(allowed_payment_modes)) and deposit_paise is null)
  );

create or replace function public.save_provider_chamber_schedule(
  p_organization_id uuid,p_resource_id uuid,p_location_id uuid,p_active boolean,
  p_effective_from date,p_effective_to date,p_booking_window_days integer,
  p_services jsonb,p_sessions jsonb
) returns uuid language plpgsql set search_path='' as $$
declare
  v_assignment_id uuid;item jsonb;requested_modes text[];primary_mode text;gateway_ready boolean;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  if not exists(select 1 from public.booking_resources where id=p_resource_id and organization_id=p_organization_id and active)
    or not exists(select 1 from public.business_locations where id=p_location_id and organization_id=p_organization_id and active)
  then raise exception 'Provider or chamber not found'; end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then raise exception 'End date must be after the start date'; end if;
  select exists(select 1 from public.payment_gateway_connections where organization_id=p_organization_id and provider='razorpay' and status in ('test','live')) into gateway_ready;
  insert into public.provider_location_assignments(organization_id,resource_id,location_id,active,effective_from,effective_to,booking_window_days)
  values(p_organization_id,p_resource_id,p_location_id,p_active,p_effective_from,p_effective_to,p_booking_window_days)
  on conflict(resource_id,location_id) do update set active=excluded.active,effective_from=excluded.effective_from,effective_to=excluded.effective_to,booking_window_days=excluded.booking_window_days,updated_at=now()
  returning id into v_assignment_id;
  delete from public.provider_location_services where assignment_id=v_assignment_id;
  for item in select value from jsonb_array_elements(coalesce(p_services,'[]'::jsonb)) loop
    if coalesce((item->>'active')::boolean,true) then
      if not exists(select 1 from public.organization_services where id=(item->>'service_id')::uuid and organization_id=p_organization_id and active and booking_enabled) then raise exception 'Invalid service selection'; end if;
      select coalesce(array_agg(value),array[coalesce(nullif(item->>'payment_mode',''),'pay_at_location')])
      into requested_modes from jsonb_array_elements_text(coalesce(item->'allowed_payment_modes','[]'::jsonb));
      if cardinality(requested_modes)=0 or not(requested_modes <@ array['pay_at_location','full_online','deposit_online']::text[]) then raise exception 'Choose valid payment options'; end if;
      if (requested_modes && array['full_online','deposit_online']::text[]) and not gateway_ready then raise exception 'Connect and verify Razorpay before enabling online payment'; end if;
      primary_mode:=case when 'pay_at_location'=any(requested_modes) then 'pay_at_location' else requested_modes[1] end;
      insert into public.provider_location_services(
        organization_id,assignment_id,service_id,active,duration_minutes,buffer_minutes,price_paise,payment_mode,allowed_payment_modes,deposit_paise
      ) values(
        p_organization_id,v_assignment_id,(item->>'service_id')::uuid,true,
        nullif(item->>'duration_minutes','')::integer,nullif(item->>'buffer_minutes','')::integer,
        nullif(item->>'price_paise','')::integer,primary_mode,requested_modes,
        case when 'deposit_online'=any(requested_modes) then nullif(item->>'deposit_paise','')::integer else null end
      );
    end if;
  end loop;
  delete from public.availability_rules where organization_id=p_organization_id and resource_id=p_resource_id and location_id=p_location_id;
  for item in select value from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb)) loop
    insert into public.availability_rules(organization_id,resource_id,location_id,weekday,start_time,end_time,slot_interval_minutes,active,effective_from,effective_to)
    values(p_organization_id,p_resource_id,p_location_id,(item->>'weekday')::smallint,(item->>'start_time')::time,(item->>'end_time')::time,coalesce((item->>'slot_interval_minutes')::integer,15),true,p_effective_from,p_effective_to);
  end loop;
  return v_assignment_id;
end;
$$;

revoke all on function public.save_provider_chamber_schedule(uuid,uuid,uuid,boolean,date,date,integer,jsonb,jsonb) from public;
grant execute on function public.save_provider_chamber_schedule(uuid,uuid,uuid,boolean,date,date,integer,jsonb,jsonb) to authenticated;

create or replace function public.get_public_booking_page(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'slug',bp.slug,'headline',bp.headline,'description',coalesce(bp.description,op.description),'accent_color',bp.accent_color,
    'business',jsonb_build_object('name',coalesce(op.business_name,o.name),'category',op.business_category,'phone',op.primary_phone,'email',op.email,'timezone',coalesce(op.timezone,'Asia/Kolkata')),
    'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'type',l.location_type,'address',l.address,'phone',l.phone,'timezone',l.timezone) order by l.created_at) from public.business_locations l where l.organization_id=o.id and l.active),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'duration_minutes',s.duration_minutes,'buffer_minutes',s.buffer_minutes,'price_paise',s.price_paise,'currency',s.currency) order by s.created_at) from public.organization_services s where s.organization_id=o.id and s.active and s.booking_enabled),'[]'::jsonb),
    'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'type',r.resource_type,'location_id',r.location_id,'timezone',r.timezone,'photo_path',pp.photo_path,'specialization',pp.specialization,'qualifications',pp.qualifications,'experience_years',pp.experience_years,'languages',pp.languages,'biography',pp.biography) order by r.created_at) from public.booking_resources r left join public.provider_profiles pp on pp.resource_id=r.id where r.organization_id=o.id and r.active),'[]'::jsonb),
    'payments_enabled',exists(select 1 from public.payment_gateway_connections g where g.organization_id=o.id and g.provider='razorpay' and g.status in ('test','live')),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'resource_id',a.resource_id,'location_id',a.location_id,'effective_from',a.effective_from,'effective_to',a.effective_to,'booking_window_days',a.booking_window_days,
      'services',coalesce((select jsonb_agg(jsonb_build_object(
        'service_id',x.service_id,'duration_minutes',coalesce(x.duration_minutes,s.duration_minutes),'buffer_minutes',coalesce(x.buffer_minutes,s.buffer_minutes),
        'price_paise',coalesce(x.price_paise,s.price_paise),'payment_mode',x.payment_mode,'allowed_payment_modes',x.allowed_payment_modes,'deposit_paise',x.deposit_paise
      )) from public.provider_location_services x join public.organization_services s on s.id=x.service_id where x.assignment_id=a.id and x.active),'[]'::jsonb)
    ) order by a.created_at) from public.provider_location_assignments a where a.organization_id=o.id and a.active),'[]'::jsonb)
  ) into result
  from public.booking_pages bp join public.organizations o on o.id=bp.organization_id left join public.onboarding_profiles op on op.organization_id=o.id
  where bp.slug=lower(trim(p_slug)) and bp.active;
  if result is null then raise exception 'Booking page not found'; end if;
  return result;
end;
$$;

grant execute on function public.get_public_booking_page(text) to anon,authenticated;

create or replace function public.create_public_payment_intent_v3(
  p_slug text,p_resource_id uuid,p_location_id uuid,p_service_id uuid,
  p_customer_name text,p_customer_phone text,p_customer_email text,p_starts_at timestamptz,
  p_selected_payment_mode text,p_notes text default null,p_intake jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  org_id uuid;v_assignment_id uuid;duration_mins int;buffer_mins int;tz text;local_start timestamp;valid_rule boolean;
  price_paise int;amount_paise int;deposit_paise int;allowed_modes text[];new_id uuid;payment_id uuid;token text;reference text;expires timestamptz;
  v_age integer;v_pincode text;result jsonb;
begin
  if p_selected_payment_mode not in ('full_online','deposit_online') then raise exception 'Choose a valid online payment option'; end if;
  v_age:=nullif(p_intake->>'age','')::integer;v_pincode:=nullif(trim(coalesce(p_intake->>'pincode','')),'');
  if v_age is not null and(v_age<0 or v_age>120) then raise exception 'Enter a valid age'; end if;
  if v_pincode is not null and v_pincode!~'^[0-9]{6}$' then raise exception 'Enter a valid 6-digit PIN code'; end if;
  if coalesce((p_intake->>'care_communications_consent')::boolean,false) is not true then raise exception 'Booking communication consent is required'; end if;
  perform private.expire_stale_payment_holds(p_resource_id);
  select organization_id into org_id from public.booking_pages where slug=lower(trim(p_slug)) and active;
  if org_id is null then raise exception 'Booking page not found'; end if;
  if length(trim(p_customer_name))<2 then raise exception 'Customer name is required'; end if;
  if nullif(trim(coalesce(p_customer_phone,'')),'') is null and nullif(trim(coalesce(p_customer_email,'')),'') is null then raise exception 'Mobile number or email is required'; end if;
  if p_starts_at<=now() then raise exception 'Appointment must be in the future'; end if;
  if not exists(select 1 from public.payment_gateway_connections where organization_id=org_id and provider='razorpay' and status in('test','live')) then raise exception 'Online payment is not available'; end if;
  select a.id into v_assignment_id from public.provider_location_assignments a where a.organization_id=org_id and a.resource_id=p_resource_id and a.location_id=p_location_id and a.active
    and(p_starts_at at time zone 'Asia/Kolkata')::date>=a.effective_from and(a.effective_to is null or(p_starts_at at time zone 'Asia/Kolkata')::date<=a.effective_to);
  select coalesce(x.duration_minutes,s.duration_minutes),coalesce(x.buffer_minutes,s.buffer_minutes),coalesce(x.price_paise,s.price_paise),x.deposit_paise,x.allowed_payment_modes
  into duration_mins,buffer_mins,price_paise,deposit_paise,allowed_modes from public.provider_location_services x join public.organization_services s on s.id=x.service_id
  where x.assignment_id=v_assignment_id and x.service_id=p_service_id and x.active and s.active and s.booking_enabled;
  select timezone into tz from public.booking_resources where id=p_resource_id and organization_id=org_id and active;
  if duration_mins is null or tz is null then raise exception 'Invalid booking selection'; end if;
  if not(p_selected_payment_mode=any(allowed_modes)) then raise exception 'This payment option is not enabled by the clinic'; end if;
  amount_paise:=case when p_selected_payment_mode='deposit_online' then deposit_paise else price_paise end;
  if amount_paise is null or amount_paise<=0 or price_paise is null or amount_paise>price_paise then raise exception 'Invalid payment amount'; end if;
  local_start:=p_starts_at at time zone tz;
  select exists(select 1 from public.availability_rules r where r.organization_id=org_id and r.resource_id=p_resource_id and r.active
    and r.weekday=extract(dow from local_start)::int and(r.effective_from is null or local_start::date>=r.effective_from) and(r.effective_to is null or local_start::date<=r.effective_to)
    and(r.location_id=p_location_id or(r.location_id is null and not exists(select 1 from public.availability_rules e where e.organization_id=org_id and e.resource_id=p_resource_id and e.location_id=p_location_id and e.active and e.weekday=extract(dow from local_start)::int and(e.effective_from is null or local_start::date>=e.effective_from) and(e.effective_to is null or local_start::date<=e.effective_to))))
    and local_start::time>=r.start_time and local_start::time+make_interval(mins=>duration_mins+buffer_mins)<=r.end_time
    and mod((extract(epoch from(local_start::time-r.start_time))/60)::int,r.slot_interval_minutes)=0) into valid_rule;
  if not valid_rule then raise exception 'Selected time is not available'; end if;
  expires:=now()+interval '10 minutes';
  insert into public.appointments(organization_id,resource_id,location_id,service_id,customer_name,customer_phone,customer_email,starts_at,ends_at,status,source,notes,hold_expires_at,payment_status,
    patient_age,health_concern,patient_locality,patient_pincode,patient_summary,care_communications_consent,marketing_consent)
  values(org_id,p_resource_id,p_location_id,p_service_id,trim(p_customer_name),nullif(trim(coalesce(p_customer_phone,'')),''),nullif(trim(coalesce(p_customer_email,'')),''),
    p_starts_at,p_starts_at+make_interval(mins=>duration_mins+buffer_mins),'payment_pending','web',nullif(trim(coalesce(p_notes,'')),''),expires,'pending',
    v_age,nullif(trim(coalesce(p_intake->>'health_concern','')),''),nullif(trim(coalesce(p_intake->>'locality','')),''),v_pincode,
    nullif(trim(coalesce(p_intake->>'summary','')),''),true,coalesce((p_intake->>'marketing_consent')::boolean,false))
  returning id into new_id;
  token:=encode(extensions.gen_random_bytes(24),'hex');reference:='OMNI-'||upper(substr(replace(new_id::text,'-',''),1,8));
  insert into private.customer_booking_access(appointment_id,booking_reference,token_hash) values(new_id,reference,extensions.digest(convert_to(token,'UTF8'),'sha256'));
  insert into public.booking_payments(organization_id,appointment_id,payment_mode,amount_paise,status,expires_at)
  values(org_id,new_id,p_selected_payment_mode,amount_paise,'created',expires) returning id into payment_id;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
  values(org_id,new_id,'payment_hold_created','customer',jsonb_build_object('expires_at',expires,'amount_paise',amount_paise,'payment_mode',p_selected_payment_mode));
  result:=jsonb_build_object('appointment_id',new_id,'payment_id',payment_id,'booking_reference',reference,'manage_token',token,'amount_paise',amount_paise,'currency','INR',
    'payment_mode',p_selected_payment_mode,'expires_at',expires,'starts_at',p_starts_at,'ends_at',p_starts_at+make_interval(mins=>duration_mins+buffer_mins));
  return result;
exception when exclusion_violation then raise exception 'That time was just booked. Please choose another slot';
end;
$$;

revoke all on function public.create_public_payment_intent_v3(text,uuid,uuid,uuid,text,text,text,timestamptz,text,text,jsonb) from public;
grant execute on function public.create_public_payment_intent_v3(text,uuid,uuid,uuid,text,text,text,timestamptz,text,text,jsonb) to anon,authenticated;
