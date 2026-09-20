create or replace function private.expire_stale_payment_holds(p_resource_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  update public.booking_payments p
  set status='expired',updated_at=now()
  from public.appointments a
  where p.appointment_id=a.id
    and p.status='created'
    and a.status='payment_pending'
    and a.hold_expires_at<=now()
    and (p_resource_id is null or a.resource_id=p_resource_id);
  update public.appointments
  set status='cancelled',payment_status='failed',updated_at=now()
  where status='payment_pending' and hold_expires_at<=now()
    and (p_resource_id is null or resource_id=p_resource_id);
  get diagnostics affected=row_count;
  return affected;
end;
$$;

revoke all on function private.expire_stale_payment_holds(uuid) from public,anon,authenticated;

create or replace function public.create_public_payment_intent(
  p_slug text,p_resource_id uuid,p_location_id uuid,p_service_id uuid,
  p_customer_name text,p_customer_phone text,p_customer_email text,
  p_starts_at timestamptz,p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  org_id uuid;v_assignment_id uuid;duration_mins int;buffer_mins int;tz text;
  local_start timestamp;valid_rule boolean;v_payment_mode text;price_mins int;
  amount_paise int;new_id uuid;payment_id uuid;token text;reference text;expires timestamptz;
begin
  perform private.expire_stale_payment_holds(p_resource_id);
  select organization_id into org_id from public.booking_pages where slug=lower(trim(p_slug)) and active;
  if org_id is null then raise exception 'Booking page not found'; end if;
  if length(trim(p_customer_name))<2 then raise exception 'Customer name is required'; end if;
  if nullif(trim(coalesce(p_customer_phone,'')),'') is null and nullif(trim(coalesce(p_customer_email,'')),'') is null then raise exception 'Mobile number or email is required'; end if;
  if p_starts_at<=now() then raise exception 'Appointment must be in the future'; end if;
  if not exists(select 1 from public.payment_gateway_connections where organization_id=org_id and provider='razorpay' and status in ('test','live')) then raise exception 'Online payment is not available'; end if;

  select a.id into v_assignment_id from public.provider_location_assignments a
  where a.organization_id=org_id and a.resource_id=p_resource_id and a.location_id=p_location_id and a.active
    and (p_starts_at at time zone 'Asia/Kolkata')::date>=a.effective_from
    and (a.effective_to is null or (p_starts_at at time zone 'Asia/Kolkata')::date<=a.effective_to);
  select coalesce(x.duration_minutes,s.duration_minutes),coalesce(x.buffer_minutes,s.buffer_minutes),
    x.payment_mode,coalesce(x.price_paise,s.price_paise),
    case when x.payment_mode='deposit_online' then x.deposit_paise else coalesce(x.price_paise,s.price_paise) end
  into duration_mins,buffer_mins,v_payment_mode,price_mins,amount_paise
  from public.provider_location_services x join public.organization_services s on s.id=x.service_id
  where x.assignment_id=v_assignment_id and x.service_id=p_service_id and x.active and s.active and s.booking_enabled;
  select timezone into tz from public.booking_resources where id=p_resource_id and organization_id=org_id and active;
  if duration_mins is null or tz is null or v_payment_mode not in ('full_online','deposit_online') then raise exception 'Online payment is not required for this selection'; end if;
  if amount_paise is null or amount_paise<=0 or price_mins is null or amount_paise>price_mins then raise exception 'Invalid payment amount'; end if;

  local_start:=p_starts_at at time zone tz;
  select exists(
    select 1 from public.availability_rules r
    where r.organization_id=org_id and r.resource_id=p_resource_id and r.active
      and r.weekday=extract(dow from local_start)::int
      and (r.effective_from is null or local_start::date>=r.effective_from)
      and (r.effective_to is null or local_start::date<=r.effective_to)
      and (r.location_id=p_location_id or (r.location_id is null and not exists(
        select 1 from public.availability_rules exact
        where exact.organization_id=org_id and exact.resource_id=p_resource_id and exact.location_id=p_location_id
          and exact.active and exact.weekday=extract(dow from local_start)::int
          and (exact.effective_from is null or local_start::date>=exact.effective_from)
          and (exact.effective_to is null or local_start::date<=exact.effective_to)
      )))
      and local_start::time>=r.start_time
      and local_start::time+make_interval(mins=>duration_mins+buffer_mins)<=r.end_time
      and mod((extract(epoch from (local_start::time-r.start_time))/60)::int,r.slot_interval_minutes)=0
  ) into valid_rule;
  if not valid_rule then raise exception 'Selected time is not available'; end if;

  expires:=now()+interval '10 minutes';
  insert into public.appointments(
    organization_id,resource_id,location_id,service_id,customer_name,customer_phone,customer_email,
    starts_at,ends_at,status,source,notes,hold_expires_at,payment_status
  ) values(
    org_id,p_resource_id,p_location_id,p_service_id,trim(p_customer_name),
    nullif(trim(coalesce(p_customer_phone,'')),''),nullif(trim(coalesce(p_customer_email,'')),''),
    p_starts_at,p_starts_at+make_interval(mins=>duration_mins+buffer_mins),'payment_pending','web',
    nullif(trim(coalesce(p_notes,'')),''),expires,'pending'
  ) returning id into new_id;
  token:=encode(extensions.gen_random_bytes(24),'hex');
  reference:='OMNI-'||upper(substr(replace(new_id::text,'-',''),1,8));
  insert into private.customer_booking_access(appointment_id,booking_reference,token_hash)
  values(new_id,reference,extensions.digest(convert_to(token,'UTF8'),'sha256'));
  insert into public.booking_payments(organization_id,appointment_id,payment_mode,amount_paise,status,expires_at)
  values(org_id,new_id,v_payment_mode,amount_paise,'created',expires) returning id into payment_id;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
  values(org_id,new_id,'payment_hold_created','customer',jsonb_build_object('expires_at',expires,'amount_paise',amount_paise));
  return jsonb_build_object(
    'appointment_id',new_id,'payment_id',payment_id,'booking_reference',reference,'manage_token',token,
    'amount_paise',amount_paise,'currency','INR','payment_mode',v_payment_mode,'expires_at',expires,
    'starts_at',p_starts_at,'ends_at',p_starts_at+make_interval(mins=>duration_mins+buffer_mins)
  );
exception when exclusion_violation then raise exception 'That time was just booked. Please choose another slot';
end;
$$;

create or replace function public.attach_public_payment_order(
  p_booking_reference text,p_manage_token text,p_provider_order_id text
) returns void language plpgsql security definer set search_path='' as $$
declare v_appointment_id uuid;
begin
  select c.appointment_id into v_appointment_id from private.customer_booking_access c
  where c.booking_reference=upper(trim(p_booking_reference))
    and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  if v_appointment_id is null or length(trim(p_provider_order_id))<5 then raise exception 'Payment hold not found'; end if;
  update public.booking_payments p set provider_order_id=trim(p_provider_order_id),updated_at=now()
  from public.appointments a
  where p.appointment_id=v_appointment_id and a.id=p.appointment_id and p.status='created'
    and a.status='payment_pending' and a.hold_expires_at>now();
  if not found then raise exception 'Payment hold has expired'; end if;
end;
$$;

create or replace function public.confirm_public_payment(
  p_booking_reference text,p_manage_token text,p_provider_order_id text,p_provider_payment_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_appointment_id uuid;org_id uuid;result jsonb;
begin
  select c.appointment_id into v_appointment_id from private.customer_booking_access c
  where c.booking_reference=upper(trim(p_booking_reference))
    and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  if v_appointment_id is null then raise exception 'Payment hold not found'; end if;
  update public.booking_payments p set status='paid',provider_payment_id=trim(p_provider_payment_id),paid_at=now(),updated_at=now()
  from public.appointments a
  where p.appointment_id=v_appointment_id and a.id=p.appointment_id and p.status='created'
    and p.provider_order_id=p_provider_order_id and a.status='payment_pending' and a.hold_expires_at>now()
  returning p.organization_id into org_id;
  if org_id is null then raise exception 'Payment hold has expired or was already processed'; end if;
  update public.appointments set status='confirmed',payment_status='paid',hold_expires_at=null,updated_at=now()
  where id=v_appointment_id;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
  values(org_id,v_appointment_id,'payment_confirmed','system',jsonb_build_object('provider','razorpay','provider_payment_id',p_provider_payment_id));
  perform private.queue_appointment_reminders(v_appointment_id);
  select jsonb_build_object(
    'appointment_id',a.id,'booking_reference',upper(trim(p_booking_reference)),
    'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,'payment_status',a.payment_status
  ) into result from public.appointments a where a.id=v_appointment_id;
  return result;
end;
$$;

revoke all on function public.create_public_payment_intent(text,uuid,uuid,uuid,text,text,text,timestamptz,text) from public;
revoke all on function public.attach_public_payment_order(text,text,text) from public;
revoke all on function public.confirm_public_payment(text,text,text,text) from public;
grant execute on function public.create_public_payment_intent(text,uuid,uuid,uuid,text,text,text,timestamptz,text) to anon;
grant execute on function public.attach_public_payment_order(text,text,text) to anon;
grant execute on function public.confirm_public_payment(text,text,text,text) to anon;

-- Pay-at-clinic remains the only path that can confirm without a payment.
create or replace function public.create_public_appointment(
  p_slug text,p_resource_id uuid,p_location_id uuid,p_service_id uuid,p_customer_name text,
  p_customer_phone text,p_customer_email text,p_starts_at timestamptz,p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  org_id uuid;duration_mins int;buffer_mins int;tz text;local_start timestamp;
  v_assignment_id uuid;valid_rule boolean;new_id uuid;token text;reference text;v_payment_mode text;
begin
  perform private.expire_stale_payment_holds(p_resource_id);
  select organization_id into org_id from public.booking_pages where slug=lower(trim(p_slug)) and active;
  if org_id is null then raise exception 'Booking page not found'; end if;
  if length(trim(p_customer_name))<2 then raise exception 'Customer name is required'; end if;
  if nullif(trim(coalesce(p_customer_phone,'')),'') is null and nullif(trim(coalesce(p_customer_email,'')),'') is null then raise exception 'Mobile number or email is required'; end if;
  if p_starts_at<=now() then raise exception 'Appointment must be in the future'; end if;
  select a.id into v_assignment_id from public.provider_location_assignments a where a.organization_id=org_id and a.resource_id=p_resource_id and a.location_id=p_location_id and a.active
    and (p_starts_at at time zone 'Asia/Kolkata')::date>=a.effective_from and (a.effective_to is null or (p_starts_at at time zone 'Asia/Kolkata')::date<=a.effective_to);
  select coalesce(x.duration_minutes,s.duration_minutes),coalesce(x.buffer_minutes,s.buffer_minutes),x.payment_mode
  into duration_mins,buffer_mins,v_payment_mode from public.provider_location_services x join public.organization_services s on s.id=x.service_id
  where x.assignment_id=v_assignment_id and x.service_id=p_service_id and x.active and s.active and s.booking_enabled;
  select timezone into tz from public.booking_resources where id=p_resource_id and organization_id=org_id and active;
  if duration_mins is null or tz is null then raise exception 'Invalid booking selection'; end if;
  if v_payment_mode<>'pay_at_location' then raise exception 'Online payment is required for this appointment'; end if;
  local_start:=p_starts_at at time zone tz;
  select exists(select 1 from public.availability_rules r where r.organization_id=org_id and r.resource_id=p_resource_id and r.active
    and r.weekday=extract(dow from local_start)::int and (r.effective_from is null or local_start::date>=r.effective_from)
    and (r.effective_to is null or local_start::date<=r.effective_to)
    and (r.location_id=p_location_id or (r.location_id is null and not exists(select 1 from public.availability_rules exact where exact.organization_id=org_id and exact.resource_id=p_resource_id and exact.location_id=p_location_id and exact.active and exact.weekday=extract(dow from local_start)::int and (exact.effective_from is null or local_start::date>=exact.effective_from) and (exact.effective_to is null or local_start::date<=exact.effective_to))))
    and local_start::time>=r.start_time and local_start::time+make_interval(mins=>duration_mins+buffer_mins)<=r.end_time
    and mod((extract(epoch from (local_start::time-r.start_time))/60)::int,r.slot_interval_minutes)=0) into valid_rule;
  if not valid_rule then raise exception 'Selected time is not available'; end if;
  insert into public.appointments(organization_id,resource_id,location_id,service_id,customer_name,customer_phone,customer_email,starts_at,ends_at,status,source,notes)
  values(org_id,p_resource_id,p_location_id,p_service_id,trim(p_customer_name),nullif(trim(coalesce(p_customer_phone,'')),''),nullif(trim(coalesce(p_customer_email,'')),''),p_starts_at,p_starts_at+make_interval(mins=>duration_mins+buffer_mins),'confirmed','web',nullif(trim(coalesce(p_notes,'')),''))
  returning id into new_id;
  token:=encode(extensions.gen_random_bytes(24),'hex');reference:='OMNI-'||upper(substr(replace(new_id::text,'-',''),1,8));
  insert into private.customer_booking_access(appointment_id,booking_reference,token_hash) values(new_id,reference,extensions.digest(convert_to(token,'UTF8'),'sha256'));
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details) values(org_id,new_id,'created','customer',jsonb_build_object('source','web'));
  perform private.queue_appointment_reminders(new_id);
  return jsonb_build_object('appointment_id',new_id,'booking_reference',reference,'manage_token',token,'starts_at',p_starts_at,'ends_at',p_starts_at+make_interval(mins=>duration_mins+buffer_mins));
exception when exclusion_violation then raise exception 'That time was just booked. Please choose another slot';
end;
$$;

grant execute on function public.create_public_appointment(text,uuid,uuid,uuid,text,text,text,timestamptz,text) to anon,authenticated;

create or replace function public.get_public_booking_slots(
  p_slug text,p_service_id uuid,p_location_id uuid,p_resource_id uuid,p_date date
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  org_id uuid;service_duration int;service_buffer int;rule record;resource_tz text;
  cursor_time timestamp;end_local timestamp;slot_start timestamptz;result jsonb:='[]'::jsonb;
  v_assignment_id uuid;window_days int;exact_rules boolean;
begin
  select organization_id into org_id from public.booking_pages where slug=lower(trim(p_slug)) and active;
  if org_id is null then raise exception 'Booking page not found'; end if;
  select a.id,a.booking_window_days into v_assignment_id,window_days from public.provider_location_assignments a
  where a.organization_id=org_id and a.resource_id=p_resource_id and a.location_id=p_location_id and a.active and p_date>=a.effective_from and (a.effective_to is null or p_date<=a.effective_to);
  if v_assignment_id is null then return result; end if;
  if p_date<(now() at time zone 'Asia/Kolkata')::date or p_date>(now() at time zone 'Asia/Kolkata')::date+window_days then raise exception 'Date is outside the booking window'; end if;
  select coalesce(x.duration_minutes,s.duration_minutes),coalesce(x.buffer_minutes,s.buffer_minutes) into service_duration,service_buffer
  from public.provider_location_services x join public.organization_services s on s.id=x.service_id
  where x.assignment_id=v_assignment_id and x.service_id=p_service_id and x.active and s.active and s.booking_enabled;
  select timezone into resource_tz from public.booking_resources where id=p_resource_id and organization_id=org_id and active;
  if service_duration is null or resource_tz is null then raise exception 'Invalid booking selection'; end if;
  exact_rules:=exists(select 1 from public.availability_rules where organization_id=org_id and resource_id=p_resource_id and location_id=p_location_id and active and weekday=extract(dow from p_date)::int and (effective_from is null or p_date>=effective_from) and (effective_to is null or p_date<=effective_to));
  for rule in select * from public.availability_rules where organization_id=org_id and resource_id=p_resource_id and active and weekday=extract(dow from p_date)::int
    and ((exact_rules and location_id=p_location_id) or (not exact_rules and location_id is null))
    and (effective_from is null or p_date>=effective_from) and (effective_to is null or p_date<=effective_to) order by start_time
  loop
    cursor_time:=p_date+rule.start_time;end_local:=p_date+rule.end_time;
    while cursor_time+make_interval(mins=>service_duration+service_buffer)<=end_local loop
      slot_start:=cursor_time at time zone resource_tz;
      if slot_start>now()
        and not exists(select 1 from public.appointments a where a.resource_id=p_resource_id
          and (a.status in ('pending','confirmed') or (a.status='payment_pending' and a.hold_expires_at>now()))
          and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(slot_start,slot_start+make_interval(mins=>service_duration+service_buffer),'[)'))
        and not exists(select 1 from public.schedule_exceptions e where e.organization_id=org_id and e.status='active' and (e.resource_id is null or e.resource_id=p_resource_id) and (e.location_id is null or e.location_id=p_location_id) and tstzrange(e.starts_at,e.ends_at,'[)')&&tstzrange(slot_start,slot_start+make_interval(mins=>service_duration+service_buffer),'[)'))
      then result:=result||jsonb_build_array(jsonb_build_object('starts_at',slot_start,'label',to_char(cursor_time,'HH12:MI AM')));end if;
      cursor_time:=cursor_time+make_interval(mins=>rule.slot_interval_minutes);
    end loop;
  end loop;
  return result;
end;
$$;

grant execute on function public.get_public_booking_slots(text,uuid,uuid,uuid,date) to anon,authenticated;
