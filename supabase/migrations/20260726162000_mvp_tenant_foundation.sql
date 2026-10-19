-- OmniRelay MVP tenant foundation.
-- Additive and safe for the existing OpenBSP schema.

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'oem_admin'
    check (role in ('oem_admin', 'oem_support', 'oem_billing')),
  active boolean not null default true,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id),
  notes text
);

revoke all on private.platform_operators from public, anon, authenticated;

create or replace function private.is_platform_operator(required_role text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from private.platform_operators po
      where po.user_id = (select auth.uid())
        and po.active
        and (required_role is null or po.role = required_role)
    );
$$;

create or replace function private.is_organization_member(
  target_organization_id uuid,
  minimum_role text default 'member'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.agents a
      where a.organization_id = target_organization_id
        and a.user_id = (select auth.uid())
        and case coalesce(a.extra->>'role', 'member')
          when 'owner' then 30
          when 'admin' then 20
          else 10
        end >= case minimum_role
          when 'owner' then 30
          when 'admin' then 20
          else 10
        end
    );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_platform_operator(text) to authenticated;
grant execute on function private.is_organization_member(uuid, text) to authenticated;

create table if not exists public.saas_plans (
  id text primary key,
  name text not null,
  monthly_price_paise integer not null check (monthly_price_paise >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  max_locations integer not null check (max_locations > 0),
  max_seats integer not null check (max_seats > 0),
  conversations_quota integer not null check (conversations_quota >= 0),
  channels jsonb not null default '[]'::jsonb,
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  location_type text not null default 'branch'
    check (location_type in ('chamber', 'clinic', 'branch', 'restaurant', 'virtual')),
  timezone text not null default 'Asia/Kolkata',
  address jsonb not null default '{}'::jsonb,
  phone text,
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.organization_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  service_type text not null,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 1440),
  price_paise integer check (price_paise is null or price_paise >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists business_locations_organization_idx
  on public.business_locations (organization_id, active);
create index if not exists organization_services_organization_idx
  on public.organization_services (organization_id, active);

alter table public.entitlements
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists grace_ends_at timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

alter table public.saas_plans enable row level security;
alter table public.business_locations enable row level security;
alter table public.organization_services enable row level security;

grant select on public.saas_plans to anon, authenticated;
grant select, insert, update, delete on public.business_locations to authenticated;
grant select, insert, update, delete on public.organization_services to authenticated;
grant select, insert, update on public.onboarding_profiles to authenticated;
grant select on public.entitlements to authenticated;

drop policy if exists "active plans are publicly readable" on public.saas_plans;
create policy "active plans are publicly readable"
on public.saas_plans for select
to anon, authenticated
using (active);

drop policy if exists "members can read business locations" on public.business_locations;
create policy "members can read business locations"
on public.business_locations for select
to authenticated
using (private.is_organization_member(organization_id, 'member'));

drop policy if exists "admins can create business locations" on public.business_locations;
create policy "admins can create business locations"
on public.business_locations for insert
to authenticated
with check (private.is_organization_member(organization_id, 'admin'));

drop policy if exists "admins can update business locations" on public.business_locations;
create policy "admins can update business locations"
on public.business_locations for update
to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));

drop policy if exists "owners can delete business locations" on public.business_locations;
create policy "owners can delete business locations"
on public.business_locations for delete
to authenticated
using (private.is_organization_member(organization_id, 'owner'));

drop policy if exists "members can read organization services" on public.organization_services;
create policy "members can read organization services"
on public.organization_services for select
to authenticated
using (private.is_organization_member(organization_id, 'member'));

drop policy if exists "admins can create organization services" on public.organization_services;
create policy "admins can create organization services"
on public.organization_services for insert
to authenticated
with check (private.is_organization_member(organization_id, 'admin'));

drop policy if exists "admins can update organization services" on public.organization_services;
create policy "admins can update organization services"
on public.organization_services for update
to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));

drop policy if exists "owners can delete organization services" on public.organization_services;
create policy "owners can delete organization services"
on public.organization_services for delete
to authenticated
using (private.is_organization_member(organization_id, 'owner'));

drop policy if exists "members can read onboarding profile" on public.onboarding_profiles;
create policy "members can read onboarding profile"
on public.onboarding_profiles for select
to authenticated
using (private.is_organization_member(organization_id, 'member'));

drop policy if exists "owners can create onboarding profile" on public.onboarding_profiles;
create policy "owners can create onboarding profile"
on public.onboarding_profiles for insert
to authenticated
with check (private.is_organization_member(organization_id, 'owner'));

drop policy if exists "admins can update onboarding profile" on public.onboarding_profiles;
create policy "admins can update onboarding profile"
on public.onboarding_profiles for update
to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));

drop policy if exists "platform operators can read organizations" on public.organizations;
create policy "platform operators can read organizations"
on public.organizations for select
to authenticated
using (private.is_platform_operator());

drop policy if exists "platform operators can read entitlements" on public.entitlements;
create policy "platform operators can read entitlements"
on public.entitlements for select
to authenticated
using (private.is_platform_operator());

insert into billing.tiers (id, name, level, active)
values ('mvp', 'MVP', 0, true)
on conflict (id) do update set
  name = excluded.name,
  level = excluded.level,
  active = excluded.active;

insert into billing.plans (id, min_tier, price, billing_cycle, is_default, active)
values
  ('launch', 0, 299, 'month', true, true),
  ('grow', 0, 499, 'month', false, true),
  ('scale', 0, 699, 'month', false, true)
on conflict (id) do update set
  min_tier = excluded.min_tier,
  price = excluded.price,
  billing_cycle = excluded.billing_cycle,
  is_default = excluded.is_default,
  active = excluded.active;

insert into public.saas_plans (
  id, name, monthly_price_paise, max_locations, max_seats,
  conversations_quota, channels, features, active, display_order
)
values
  (
    'launch', 'Launch', 29900, 1, 2, 500,
    '["whatsapp"]'::jsonb,
    '["appointments","basic_rag","starter_workflows"]'::jsonb,
    true, 10
  ),
  (
    'grow', 'Grow', 49900, 3, 5, 2000,
    '["whatsapp","instagram","webchat"]'::jsonb,
    '["appointments","calendar_sync","rag","n8n_workflows","revisit_reminders"]'::jsonb,
    true, 20
  ),
  (
    'scale', 'Scale', 69900, 5, 10, 5000,
    '["whatsapp","instagram","webchat"]'::jsonb,
    '["appointments","calendar_sync","advanced_rag","n8n_workflows","analytics","priority_support"]'::jsonb,
    true, 30
  )
on conflict (id) do update set
  name = excluded.name,
  monthly_price_paise = excluded.monthly_price_paise,
  max_locations = excluded.max_locations,
  max_seats = excluded.max_seats,
  conversations_quota = excluded.conversations_quota,
  channels = excluded.channels,
  features = excluded.features,
  active = excluded.active,
  display_order = excluded.display_order,
  updated_at = now();

create or replace function private.initialize_omnirelay_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  business_category text := coalesce(new.extra->>'business_category', 'Professional services');
  location_count integer := greatest(
    1,
    least(coalesce((new.extra->>'location_count')::integer, 1), 5)
  );
  workspace_timezone text := coalesce(new.extra->>'timezone', 'Asia/Kolkata');
  inferred_location_type text;
  starter_service_name text;
begin
  inferred_location_type := case business_category
    when 'Healthcare' then 'chamber'
    when 'Hospitality' then 'restaurant'
    else 'branch'
  end;
  starter_service_name := case business_category
    when 'Healthcare' then 'Consultation'
    when 'Hospitality' then 'Reservation'
    else 'Discovery call'
  end;

  insert into public.onboarding_profiles (
    organization_id, business_category, business_name, timezone, services_offered
  )
  values (
    new.id, business_category, new.name, workspace_timezone,
    jsonb_build_array(starter_service_name)
  )
  on conflict (organization_id) do nothing;

  insert into public.business_locations (
    organization_id, name, location_type, timezone, created_by
  )
  select
    new.id,
    case
      when business_category = 'Healthcare' then 'Chamber ' || series_number
      when business_category = 'Hospitality' then 'Location ' || series_number
      else 'Office ' || series_number
    end,
    inferred_location_type,
    workspace_timezone,
    (select auth.uid())
  from generate_series(1, location_count) as series_number
  on conflict (organization_id, name) do nothing;

  insert into public.organization_services (
    organization_id, name, service_type, duration_minutes
  )
  values (
    new.id,
    starter_service_name,
    lower(replace(business_category, ' ', '_')),
    case when business_category = 'Hospitality' then 90 else 30 end
  )
  on conflict (organization_id, name) do nothing;

  insert into public.entitlements (
    organization_id, plan_id, max_workspaces, max_seats,
    conversations_quota, channels, features, white_label, status,
    trial_started_at, trial_ends_at
  )
  values (
    new.id, 'launch', 1, 2,
    500, '["whatsapp"]'::jsonb,
    '["appointments","basic_rag","starter_workflows"]'::jsonb,
    false, 'trialing', now(), now() + interval '7 days'
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

revoke all on function private.initialize_omnirelay_workspace()
  from public, anon, authenticated;

drop trigger if exists initialize_omnirelay_workspace on public.organizations;
create trigger initialize_omnirelay_workspace
after insert on public.organizations
for each row execute function private.initialize_omnirelay_workspace();

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
