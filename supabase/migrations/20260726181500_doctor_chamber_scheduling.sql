create table public.provider_location_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_id uuid not null references public.booking_resources(id) on delete cascade,
  location_id uuid not null references public.business_locations(id) on delete cascade,
  active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  booking_window_days integer not null default 60 check (booking_window_days between 1 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource_id, location_id),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.provider_location_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assignment_id uuid not null references public.provider_location_assignments(id) on delete cascade,
  service_id uuid not null references public.organization_services(id) on delete cascade,
  active boolean not null default true,
  duration_minutes integer check (duration_minutes between 5 and 480),
  buffer_minutes integer check (buffer_minutes between 0 and 240),
  price_paise integer check (price_paise >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, service_id)
);

alter table public.availability_rules
  add column effective_from date,
  add column effective_to date,
  add constraint availability_effective_window
    check (effective_to is null or effective_from is null or effective_to >= effective_from);

create index provider_location_assignments_lookup
  on public.provider_location_assignments (organization_id, resource_id, location_id, active);
create index provider_location_services_lookup
  on public.provider_location_services (assignment_id, service_id, active);
create index availability_rules_chamber_lookup
  on public.availability_rules (resource_id, location_id, weekday, active);

alter table public.provider_location_assignments enable row level security;
alter table public.provider_location_services enable row level security;
grant select, insert, update, delete on public.provider_location_assignments to authenticated;
grant select, insert, update, delete on public.provider_location_services to authenticated;

create policy "members read provider chamber assignments"
on public.provider_location_assignments for select to authenticated
using (private.is_organization_member(organization_id, 'member'));
create policy "admins create provider chamber assignments"
on public.provider_location_assignments for insert to authenticated
with check (private.is_organization_member(organization_id, 'admin'));
create policy "admins update provider chamber assignments"
on public.provider_location_assignments for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));
create policy "owners delete provider chamber assignments"
on public.provider_location_assignments for delete to authenticated
using (private.is_organization_member(organization_id, 'owner'));

create policy "members read provider chamber services"
on public.provider_location_services for select to authenticated
using (private.is_organization_member(organization_id, 'member'));
create policy "admins create provider chamber services"
on public.provider_location_services for insert to authenticated
with check (private.is_organization_member(organization_id, 'admin'));
create policy "admins update provider chamber services"
on public.provider_location_services for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));
create policy "owners delete provider chamber services"
on public.provider_location_services for delete to authenticated
using (private.is_organization_member(organization_id, 'owner'));

-- Existing workspaces remain bookable while owners progressively configure each chamber.
insert into public.provider_location_assignments
  (organization_id, resource_id, location_id, active, effective_from)
select r.organization_id, r.id, l.id, true, current_date
from public.booking_resources r
join public.business_locations l on l.organization_id = r.organization_id and l.active
where r.active
on conflict (resource_id, location_id) do nothing;

insert into public.provider_location_services
  (organization_id, assignment_id, service_id, active)
select a.organization_id, a.id, s.id, true
from public.provider_location_assignments a
join public.organization_services s on s.organization_id = a.organization_id
where a.active and s.active and s.booking_enabled
on conflict (assignment_id, service_id) do nothing;

create or replace function private.validate_chamber_availability()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.active and new.location_id is not null and exists (
    select 1
    from public.availability_rules other
    where other.id <> coalesce(new.id, gen_random_uuid())
      and other.resource_id = new.resource_id
      and other.location_id is not null
      and other.active
      and other.weekday = new.weekday
      and other.start_time < new.end_time
      and other.end_time > new.start_time
      and coalesce(other.effective_to, 'infinity'::date) >= coalesce(new.effective_from, '-infinity'::date)
      and coalesce(new.effective_to, 'infinity'::date) >= coalesce(other.effective_from, '-infinity'::date)
  ) then
    raise exception 'This provider already has overlapping chamber hours on that day';
  end if;
  return new;
end;
$$;

create trigger validate_chamber_availability_before_write
before insert or update on public.availability_rules
for each row execute function private.validate_chamber_availability();

create or replace function public.save_provider_chamber_schedule(
  p_organization_id uuid,
  p_resource_id uuid,
  p_location_id uuid,
  p_active boolean,
  p_effective_from date,
  p_effective_to date,
  p_booking_window_days integer,
  p_services jsonb,
  p_sessions jsonb
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  item jsonb;
begin
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required';
  end if;
  if not exists (
    select 1 from public.booking_resources
    where id = p_resource_id and organization_id = p_organization_id and active
  ) or not exists (
    select 1 from public.business_locations
    where id = p_location_id and organization_id = p_organization_id and active
  ) then raise exception 'Provider or chamber not found'; end if;
  if p_effective_to is not null and p_effective_to < p_effective_from then
    raise exception 'End date must be after the start date';
  end if;

  insert into public.provider_location_assignments
    (organization_id, resource_id, location_id, active, effective_from, effective_to, booking_window_days)
  values
    (p_organization_id, p_resource_id, p_location_id, p_active, p_effective_from, p_effective_to, p_booking_window_days)
  on conflict (resource_id, location_id) do update set
    active = excluded.active,
    effective_from = excluded.effective_from,
    effective_to = excluded.effective_to,
    booking_window_days = excluded.booking_window_days,
    updated_at = now()
  returning id into v_assignment_id;

  delete from public.provider_location_services where assignment_id = v_assignment_id;
  for item in select value from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    if coalesce((item->>'active')::boolean, true) then
      if not exists (
        select 1 from public.organization_services
        where id = (item->>'service_id')::uuid and organization_id = p_organization_id and active and booking_enabled
      ) then raise exception 'Invalid service selection'; end if;
      insert into public.provider_location_services
        (organization_id, assignment_id, service_id, active, duration_minutes, buffer_minutes, price_paise)
      values (
        p_organization_id, v_assignment_id, (item->>'service_id')::uuid, true,
        nullif(item->>'duration_minutes','')::integer,
        nullif(item->>'buffer_minutes','')::integer,
        nullif(item->>'price_paise','')::integer
      );
    end if;
  end loop;

  delete from public.availability_rules
  where organization_id = p_organization_id
    and resource_id = p_resource_id
    and location_id = p_location_id;
  for item in select value from jsonb_array_elements(coalesce(p_sessions, '[]'::jsonb))
  loop
    insert into public.availability_rules
      (organization_id, resource_id, location_id, weekday, start_time, end_time,
       slot_interval_minutes, active, effective_from, effective_to)
    values (
      p_organization_id, p_resource_id, p_location_id,
      (item->>'weekday')::smallint, (item->>'start_time')::time, (item->>'end_time')::time,
      coalesce((item->>'slot_interval_minutes')::integer, 15), true,
      p_effective_from, p_effective_to
    );
  end loop;
  return v_assignment_id;
end;
$$;

revoke all on function public.save_provider_chamber_schedule(uuid,uuid,uuid,boolean,date,date,integer,jsonb,jsonb) from public;
grant execute on function public.save_provider_chamber_schedule(uuid,uuid,uuid,boolean,date,date,integer,jsonb,jsonb) to authenticated;

create or replace function public.get_public_booking_page(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'slug',bp.slug,'headline',bp.headline,'description',coalesce(bp.description,op.description),'accent_color',bp.accent_color,
    'business',jsonb_build_object('name',coalesce(op.business_name,o.name),'category',op.business_category,'phone',op.primary_phone,'email',op.email,'timezone',coalesce(op.timezone,'Asia/Kolkata')),
    'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'type',l.location_type,'address',l.address,'phone',l.phone,'timezone',l.timezone) order by l.created_at) from public.business_locations l where l.organization_id=o.id and l.active),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'duration_minutes',s.duration_minutes,'buffer_minutes',s.buffer_minutes,'price_paise',s.price_paise,'currency',s.currency) order by s.created_at) from public.organization_services s where s.organization_id=o.id and s.active and s.booking_enabled),'[]'::jsonb),
    'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'type',r.resource_type,'location_id',r.location_id,'timezone',r.timezone,'photo_path',pp.photo_path,'specialization',pp.specialization,'qualifications',pp.qualifications,'experience_years',pp.experience_years,'languages',pp.languages,'biography',pp.biography) order by r.created_at) from public.booking_resources r left join public.provider_profiles pp on pp.resource_id=r.id where r.organization_id=o.id and r.active),'[]'::jsonb),
    'assignments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'resource_id',a.resource_id,'location_id',a.location_id,
        'effective_from',a.effective_from,'effective_to',a.effective_to,'booking_window_days',a.booking_window_days,
        'services',coalesce((select jsonb_agg(jsonb_build_object(
          'service_id',x.service_id,'duration_minutes',coalesce(x.duration_minutes,s.duration_minutes),
          'buffer_minutes',coalesce(x.buffer_minutes,s.buffer_minutes),'price_paise',coalesce(x.price_paise,s.price_paise)
        )) from public.provider_location_services x join public.organization_services s on s.id=x.service_id
        where x.assignment_id=a.id and x.active),'[]'::jsonb)
      ) order by a.created_at)
      from public.provider_location_assignments a
      where a.organization_id=o.id and a.active
    ),'[]'::jsonb)
  ) into result
  from public.booking_pages bp join public.organizations o on o.id=bp.organization_id left join public.onboarding_profiles op on op.organization_id=o.id
  where bp.slug=lower(trim(p_slug)) and bp.active;
  if result is null then raise exception 'Booking page not found'; end if;
  return result;
end;
$$;

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
      and (
        r.location_id=p_location_id or (
          r.location_id is null and not exists (
            select 1 from public.availability_rules exact
            where exact.organization_id=org_id and exact.resource_id=p_resource_id
              and exact.location_id=p_location_id and exact.active
              and exact.weekday=extract(dow from local_start)::int
              and (exact.effective_from is null or local_start::date>=exact.effective_from)
              and (exact.effective_to is null or local_start::date<=exact.effective_to)
          )
        )
      )
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

grant execute on function public.get_public_booking_page(text) to anon, authenticated;
grant execute on function public.get_public_booking_slots(text,uuid,uuid,uuid,date) to anon, authenticated;
grant execute on function public.create_public_appointment(text,uuid,uuid,uuid,text,text,text,timestamptz,text) to anon, authenticated;
