create extension if not exists btree_gist with schema extensions;

create table public.booking_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  name text not null,
  resource_type text not null default 'staff'
    check (resource_type in ('staff', 'doctor', 'coach', 'room', 'table_group', 'equipment')),
  timezone text not null default 'Asia/Kolkata',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_id uuid not null references public.booking_resources(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_interval_minutes integer not null default 15
    check (slot_interval_minutes between 5 and 240),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  unique nulls not distinct (resource_id, location_id, weekday, start_time, end_time)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_id uuid not null references public.booking_resources(id),
  location_id uuid not null references public.business_locations(id),
  service_id uuid not null references public.organization_services(id),
  customer_name text not null,
  customer_phone text,
  customer_email text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  source text not null default 'dashboard'
    check (source in ('dashboard', 'whatsapp', 'instagram', 'web', 'import')),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table public.appointments
  add constraint appointments_resource_no_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('pending', 'confirmed'));

create index appointments_org_start_idx
  on public.appointments (organization_id, starts_at);
create index availability_resource_weekday_idx
  on public.availability_rules (resource_id, weekday)
  where active;

alter table public.booking_resources enable row level security;
alter table public.availability_rules enable row level security;
alter table public.appointments enable row level security;

grant select, insert, update, delete on public.booking_resources to authenticated;
grant select, insert, update, delete on public.availability_rules to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;

create policy "members read booking resources"
on public.booking_resources for select to authenticated
using (private.is_organization_member(organization_id, 'member'));
create policy "admins create booking resources"
on public.booking_resources for insert to authenticated
with check (private.is_organization_member(organization_id, 'admin'));
create policy "admins update booking resources"
on public.booking_resources for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));
create policy "owners delete booking resources"
on public.booking_resources for delete to authenticated
using (private.is_organization_member(organization_id, 'owner'));

create policy "members read availability"
on public.availability_rules for select to authenticated
using (private.is_organization_member(organization_id, 'member'));
create policy "admins create availability"
on public.availability_rules for insert to authenticated
with check (private.is_organization_member(organization_id, 'admin'));
create policy "admins update availability"
on public.availability_rules for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));
create policy "owners delete availability"
on public.availability_rules for delete to authenticated
using (private.is_organization_member(organization_id, 'owner'));

create policy "members read appointments"
on public.appointments for select to authenticated
using (private.is_organization_member(organization_id, 'member'));
create policy "admins create appointments"
on public.appointments for insert to authenticated
with check (private.is_organization_member(organization_id, 'admin'));
create policy "admins update appointments"
on public.appointments for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));
create policy "owners delete appointments"
on public.appointments for delete to authenticated
using (private.is_organization_member(organization_id, 'owner'));

insert into public.booking_resources (organization_id, name, resource_type, timezone)
select o.id, 'Primary provider',
  case when o.extra->>'business_category' = 'Healthcare' then 'doctor' else 'staff' end,
  coalesce(o.extra->>'timezone', 'Asia/Kolkata')
from public.organizations o
on conflict (organization_id, name) do nothing;

insert into public.availability_rules (
  organization_id, resource_id, weekday, start_time, end_time
)
select r.organization_id, r.id, day_number, '09:00'::time, '18:00'::time
from public.booking_resources r
cross join generate_series(1, 6) as day_number
where r.name = 'Primary provider'
on conflict do nothing;

create or replace function public.create_appointment(
  p_organization_id uuid,
  p_resource_id uuid,
  p_location_id uuid,
  p_service_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_starts_at timestamptz,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  service_duration integer;
  service_buffer integer;
  new_id uuid;
begin
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required';
  end if;
  if length(trim(p_customer_name)) < 2 then
    raise exception 'Customer name is required';
  end if;
  if p_starts_at < now() - interval '5 minutes' then
    raise exception 'Appointment must be in the future';
  end if;

  select duration_minutes, buffer_minutes
  into service_duration, service_buffer
  from public.organization_services
  where id = p_service_id and organization_id = p_organization_id
    and active and booking_enabled;
  if service_duration is null then raise exception 'Bookable service not found'; end if;

  if not exists (
    select 1 from public.booking_resources
    where id = p_resource_id and organization_id = p_organization_id and active
  ) then raise exception 'Booking resource not found'; end if;
  if not exists (
    select 1 from public.business_locations
    where id = p_location_id and organization_id = p_organization_id and active
  ) then raise exception 'Location not found'; end if;

  insert into public.appointments (
    organization_id, resource_id, location_id, service_id,
    customer_name, customer_phone, customer_email, starts_at, ends_at, notes
  ) values (
    p_organization_id, p_resource_id, p_location_id, p_service_id,
    trim(p_customer_name), nullif(trim(p_customer_phone), ''),
    nullif(trim(p_customer_email), ''), p_starts_at,
    p_starts_at + make_interval(mins => service_duration + service_buffer),
    nullif(trim(p_notes), '')
  ) returning id into new_id;
  return new_id;
exception
  when exclusion_violation then
    raise exception 'This provider already has an appointment during that time';
end;
$$;

revoke all on function public.create_appointment(
  uuid, uuid, uuid, uuid, text, text, text, timestamptz, text
) from public, anon;
grant execute on function public.create_appointment(
  uuid, uuid, uuid, uuid, text, text, text, timestamptz, text
) to authenticated;
