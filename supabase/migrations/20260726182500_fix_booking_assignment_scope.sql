create or replace function public.get_public_booking_slots(
  p_slug text, p_service_id uuid, p_location_id uuid, p_resource_id uuid, p_date date
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  org_id uuid; duration_mins int; buffer_mins int; resource_tz text; window_days int;
  v_assignment_id uuid; rule record; cursor_time timestamp; end_local timestamp;
  slot_start timestamptz; result jsonb := '[]'::jsonb; exact_rules boolean;
begin
  select organization_id into org_id from public.booking_pages where slug=lower(trim(p_slug)) and active;
  if org_id is null then raise exception 'Booking page not found'; end if;
  select a.id,a.booking_window_days into v_assignment_id,window_days
  from public.provider_location_assignments a
  where a.organization_id=org_id and a.resource_id=p_resource_id and a.location_id=p_location_id and a.active
    and p_date>=a.effective_from and (a.effective_to is null or p_date<=a.effective_to);
  if v_assignment_id is null then return result; end if;
  if p_date < (now() at time zone 'Asia/Kolkata')::date
    or p_date > (now() at time zone 'Asia/Kolkata')::date + window_days then
    raise exception 'Date is outside the booking window';
  end if;
  select coalesce(x.duration_minutes,s.duration_minutes),coalesce(x.buffer_minutes,s.buffer_minutes)
  into duration_mins,buffer_mins
  from public.provider_location_services x join public.organization_services s on s.id=x.service_id
  where x.assignment_id=v_assignment_id and x.service_id=p_service_id and x.active and s.active and s.booking_enabled;
  select timezone into resource_tz from public.booking_resources
  where id=p_resource_id and organization_id=org_id and active;
  if duration_mins is null or resource_tz is null then raise exception 'Invalid booking selection'; end if;
  exact_rules := exists (
    select 1 from public.availability_rules
    where organization_id=org_id and resource_id=p_resource_id and location_id=p_location_id and active
      and weekday=extract(dow from p_date)::int
      and (effective_from is null or p_date>=effective_from)
      and (effective_to is null or p_date<=effective_to)
  );
  for rule in
    select * from public.availability_rules
    where organization_id=org_id and resource_id=p_resource_id and active
      and weekday=extract(dow from p_date)::int
      and ((exact_rules and location_id=p_location_id) or (not exact_rules and location_id is null))
      and (effective_from is null or p_date>=effective_from)
      and (effective_to is null or p_date<=effective_to)
    order by start_time
  loop
    cursor_time:=p_date+rule.start_time; end_local:=p_date+rule.end_time;
    while cursor_time+make_interval(mins=>duration_mins+buffer_mins)<=end_local loop
      slot_start:=cursor_time at time zone resource_tz;
      if slot_start>now()
        and not exists(select 1 from public.appointments a where a.resource_id=p_resource_id and a.status in ('pending','confirmed') and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(slot_start,slot_start+make_interval(mins=>duration_mins+buffer_mins),'[)'))
        and not exists(select 1 from public.schedule_exceptions e where e.organization_id=org_id and e.status='active' and (e.resource_id is null or e.resource_id=p_resource_id) and (e.location_id is null or e.location_id=p_location_id) and tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(slot_start,slot_start+make_interval(mins=>duration_mins+buffer_mins),'[)'))
      then result:=result||jsonb_build_array(jsonb_build_object('starts_at',slot_start,'label',to_char(cursor_time,'HH12:MI AM'))); end if;
      cursor_time:=cursor_time+make_interval(mins=>rule.slot_interval_minutes);
    end loop;
  end loop;
  return result;
end;
$$;

create or replace function public.create_public_appointment(
  p_slug text, p_resource_id uuid, p_location_id uuid, p_service_id uuid,
  p_customer_name text, p_customer_phone text, p_customer_email text,
  p_starts_at timestamptz, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  org_id uuid; duration_mins int; buffer_mins int; tz text; local_start timestamp;
  v_assignment_id uuid; valid_rule boolean; new_id uuid; token text; reference text;
begin
  select organization_id into org_id from public.booking_pages where slug=lower(trim(p_slug)) and active;
  if org_id is null then raise exception 'Booking page not found'; end if;
  if length(trim(p_customer_name))<2 then raise exception 'Customer name is required'; end if;
  if nullif(trim(coalesce(p_customer_phone,'')),'') is null and nullif(trim(coalesce(p_customer_email,'')),'') is null then raise exception 'Mobile number or email is required'; end if;
  if p_starts_at <= now() then raise exception 'Appointment must be in the future'; end if;
  select a.id into v_assignment_id from public.provider_location_assignments a
  where a.organization_id=org_id and a.resource_id=p_resource_id and a.location_id=p_location_id and a.active
    and (p_starts_at at time zone 'Asia/Kolkata')::date>=a.effective_from
    and (a.effective_to is null or (p_starts_at at time zone 'Asia/Kolkata')::date<=a.effective_to);
  select coalesce(x.duration_minutes,s.duration_minutes),coalesce(x.buffer_minutes,s.buffer_minutes)
  into duration_mins,buffer_mins
  from public.provider_location_services x join public.organization_services s on s.id=x.service_id
  where x.assignment_id=v_assignment_id and x.service_id=p_service_id and x.active and s.active and s.booking_enabled;
  select timezone into tz from public.booking_resources where id=p_resource_id and organization_id=org_id and active;
  if duration_mins is null or tz is null then raise exception 'Invalid booking selection'; end if;
  local_start := p_starts_at at time zone tz;
  select exists (
    select 1 from public.availability_rules r
    where r.organization_id=org_id and r.resource_id=p_resource_id and r.active
      and r.weekday=extract(dow from local_start)::int
      and (r.effective_from is null or local_start::date>=r.effective_from)
      and (r.effective_to is null or local_start::date<=r.effective_to)
      and (r.location_id=p_location_id or (r.location_id is null and not exists (
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
  insert into public.appointments(organization_id,resource_id,location_id,service_id,customer_name,customer_phone,customer_email,starts_at,ends_at,status,source,notes)
  values(org_id,p_resource_id,p_location_id,p_service_id,trim(p_customer_name),nullif(trim(coalesce(p_customer_phone,'')),''),nullif(trim(coalesce(p_customer_email,'')),''),p_starts_at,p_starts_at+make_interval(mins=>duration_mins+buffer_mins),'confirmed','web',nullif(trim(coalesce(p_notes,'')),''))
  returning id into new_id;
  token := encode(extensions.gen_random_bytes(24),'hex');
  reference := 'OMNI-'||upper(substr(replace(new_id::text,'-',''),1,8));
  insert into private.customer_booking_access(appointment_id,booking_reference,token_hash) values(new_id,reference,extensions.digest(convert_to(token,'UTF8'),'sha256'));
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details) values(org_id,new_id,'created','customer',jsonb_build_object('source','web'));
  perform private.queue_appointment_reminders(new_id);
  return jsonb_build_object('appointment_id',new_id,'booking_reference',reference,'manage_token',token,'starts_at',p_starts_at,'ends_at',p_starts_at+make_interval(mins=>duration_mins+buffer_mins));
exception when exclusion_violation then raise exception 'That time was just booked. Please choose another slot';
end;
$$;

grant execute on function public.get_public_booking_slots(text,uuid,uuid,uuid,date) to anon, authenticated;
grant execute on function public.create_public_appointment(text,uuid,uuid,uuid,text,text,text,timestamptz,text) to anon, authenticated;
