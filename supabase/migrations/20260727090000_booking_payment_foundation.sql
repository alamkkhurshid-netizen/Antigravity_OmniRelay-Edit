alter table public.provider_location_services
  add column payment_mode text not null default 'pay_at_location',
  add column deposit_paise integer,
  add constraint provider_location_services_payment_mode
    check (payment_mode in ('pay_at_location','full_online','deposit_online')),
  add constraint provider_location_services_deposit
    check (
      (payment_mode <> 'deposit_online' and deposit_paise is null)
      or (payment_mode = 'deposit_online' and deposit_paise is not null and deposit_paise > 0)
    );

create table public.payment_gateway_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('razorpay')),
  status text not null default 'not_connected'
    check (status in ('not_connected','test','live','disabled','error')),
  account_label text,
  supported_methods text[] not null default array['upi','card','netbanking']::text[],
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  provider text not null default 'razorpay',
  payment_mode text not null check (payment_mode in ('full_online','deposit_online')),
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',
  status text not null default 'created'
    check (status in ('created','authorized','paid','failed','expired','refunded','partially_refunded')),
  provider_order_id text,
  provider_payment_id text,
  provider_signature text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id)
);

alter table public.appointments
  add column hold_expires_at timestamptz,
  add column payment_status text not null default 'not_required'
    check (payment_status in ('not_required','pending','paid','failed','refunded','partial_refund'));

alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('pending','payment_pending','confirmed','completed','cancelled','no_show','rescheduling_required'));
alter table public.appointments drop constraint appointments_resource_no_overlap;
alter table public.appointments add constraint appointments_resource_no_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending','payment_pending','confirmed'));

create index booking_payments_org_status on public.booking_payments (organization_id,status,created_at desc);
create index appointments_payment_holds on public.appointments (resource_id,hold_expires_at)
  where status='payment_pending';

alter table public.payment_gateway_connections enable row level security;
alter table public.booking_payments enable row level security;
grant select,insert,update,delete on public.payment_gateway_connections to authenticated;
grant select,insert,update,delete on public.booking_payments to authenticated;

create policy "members read payment gateway status"
on public.payment_gateway_connections for select to authenticated
using (private.is_organization_member(organization_id,'member'));
create policy "owners manage payment gateway status"
on public.payment_gateway_connections for all to authenticated
using (private.is_organization_member(organization_id,'owner'))
with check (private.is_organization_member(organization_id,'owner'));
create policy "members read booking payments"
on public.booking_payments for select to authenticated
using (private.is_organization_member(organization_id,'member'));
create policy "owners manage booking payments"
on public.booking_payments for all to authenticated
using (private.is_organization_member(organization_id,'owner'))
with check (private.is_organization_member(organization_id,'owner'));

insert into public.payment_gateway_connections (organization_id,provider,status)
select id,'razorpay','not_connected' from public.organizations
on conflict (organization_id,provider) do nothing;

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
  requested_payment_mode text;
  gateway_ready boolean;
begin
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required';
  end if;
  if not exists (select 1 from public.booking_resources where id=p_resource_id and organization_id=p_organization_id and active)
    or not exists (select 1 from public.business_locations where id=p_location_id and organization_id=p_organization_id and active)
  then raise exception 'Provider or chamber not found'; end if;
  if p_effective_to is not null and p_effective_to < p_effective_from then raise exception 'End date must be after the start date'; end if;

  select exists (
    select 1 from public.payment_gateway_connections
    where organization_id=p_organization_id and provider='razorpay' and status in ('test','live')
  ) into gateway_ready;

  insert into public.provider_location_assignments
    (organization_id,resource_id,location_id,active,effective_from,effective_to,booking_window_days)
  values (p_organization_id,p_resource_id,p_location_id,p_active,p_effective_from,p_effective_to,p_booking_window_days)
  on conflict (resource_id,location_id) do update set
    active=excluded.active,effective_from=excluded.effective_from,effective_to=excluded.effective_to,
    booking_window_days=excluded.booking_window_days,updated_at=now()
  returning id into v_assignment_id;

  delete from public.provider_location_services where assignment_id=v_assignment_id;
  for item in select value from jsonb_array_elements(coalesce(p_services,'[]'::jsonb))
  loop
    if coalesce((item->>'active')::boolean,true) then
      if not exists (select 1 from public.organization_services where id=(item->>'service_id')::uuid and organization_id=p_organization_id and active and booking_enabled)
      then raise exception 'Invalid service selection'; end if;
      requested_payment_mode:=coalesce(nullif(item->>'payment_mode',''),'pay_at_location');
      if requested_payment_mode<>'pay_at_location' and not gateway_ready then
        raise exception 'Connect and verify Razorpay before enabling online payment';
      end if;
      insert into public.provider_location_services
        (organization_id,assignment_id,service_id,active,duration_minutes,buffer_minutes,price_paise,payment_mode,deposit_paise)
      values (
        p_organization_id,v_assignment_id,(item->>'service_id')::uuid,true,
        nullif(item->>'duration_minutes','')::integer,nullif(item->>'buffer_minutes','')::integer,
        nullif(item->>'price_paise','')::integer,requested_payment_mode,
        case when requested_payment_mode='deposit_online' then nullif(item->>'deposit_paise','')::integer else null end
      );
    end if;
  end loop;

  delete from public.availability_rules
  where organization_id=p_organization_id and resource_id=p_resource_id and location_id=p_location_id;
  for item in select value from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb))
  loop
    insert into public.availability_rules
      (organization_id,resource_id,location_id,weekday,start_time,end_time,slot_interval_minutes,active,effective_from,effective_to)
    values (
      p_organization_id,p_resource_id,p_location_id,(item->>'weekday')::smallint,
      (item->>'start_time')::time,(item->>'end_time')::time,
      coalesce((item->>'slot_interval_minutes')::integer,15),true,p_effective_from,p_effective_to
    );
  end loop;
  return v_assignment_id;
end;
$$;

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
    'payments_enabled',exists(select 1 from public.payment_gateway_connections g where g.organization_id=o.id and g.provider='razorpay' and g.status in ('test','live')),
    'assignments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'resource_id',a.resource_id,'location_id',a.location_id,
        'effective_from',a.effective_from,'effective_to',a.effective_to,'booking_window_days',a.booking_window_days,
        'services',coalesce((select jsonb_agg(jsonb_build_object(
          'service_id',x.service_id,'duration_minutes',coalesce(x.duration_minutes,s.duration_minutes),
          'buffer_minutes',coalesce(x.buffer_minutes,s.buffer_minutes),'price_paise',coalesce(x.price_paise,s.price_paise),
          'payment_mode',x.payment_mode,'deposit_paise',x.deposit_paise
        )) from public.provider_location_services x join public.organization_services s on s.id=x.service_id
        where x.assignment_id=a.id and x.active),'[]'::jsonb)
      ) order by a.created_at)
      from public.provider_location_assignments a where a.organization_id=o.id and a.active
    ),'[]'::jsonb)
  ) into result
  from public.booking_pages bp join public.organizations o on o.id=bp.organization_id left join public.onboarding_profiles op on op.organization_id=o.id
  where bp.slug=lower(trim(p_slug)) and bp.active;
  if result is null then raise exception 'Booking page not found'; end if;
  return result;
end;
$$;

grant execute on function public.get_public_booking_page(text) to anon,authenticated;
