alter table public.onboarding_profiles
  add column if not exists clinic_mode text not null default 'solo_practitioner'
  check (clinic_mode in ('solo_practitioner','multi_doctor_clinic','diagnostic_centre'));

update public.onboarding_profiles op
set clinic_mode=case
  when (select count(*) from public.booking_resources r where r.organization_id=op.organization_id and r.active)>1 then 'multi_doctor_clinic'
  else 'solo_practitioner'
end
where op.business_category='Healthcare';

create table if not exists public.clinic_departments(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check(char_length(trim(name)) between 2 and 80),
  code text check(code is null or code ~ '^[a-z0-9_-]{2,40}$'),
  description text check(description is null or char_length(description)<=500),
  active boolean not null default true,
  sort_order integer not null default 0 check(sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,organization_id)
);
create unique index if not exists clinic_departments_org_name_unique
  on public.clinic_departments(organization_id,lower(name));
create index if not exists clinic_departments_active_order_idx
  on public.clinic_departments(organization_id,active,sort_order,name);

alter table public.booking_resources
  add constraint booking_resources_id_organization_unique unique(id,organization_id);

create table if not exists public.provider_departments(
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null,
  resource_id uuid not null,
  primary_department boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(department_id,resource_id),
  foreign key(department_id,organization_id) references public.clinic_departments(id,organization_id) on delete cascade,
  foreign key(resource_id,organization_id) references public.booking_resources(id,organization_id) on delete cascade
);
create index if not exists provider_departments_resource_idx
  on public.provider_departments(organization_id,resource_id,primary_department);

alter table public.clinic_departments enable row level security;
alter table public.provider_departments enable row level security;
grant select,insert,update,delete on public.clinic_departments to authenticated;
grant select,insert,update,delete on public.provider_departments to authenticated;

create policy "members read clinic departments"
on public.clinic_departments for select to authenticated
using(private.is_organization_member(organization_id,'member'));
create policy "admins manage clinic departments"
on public.clinic_departments for all to authenticated
using(private.is_organization_member(organization_id,'admin'))
with check(private.is_organization_member(organization_id,'admin'));

create policy "members read provider departments"
on public.provider_departments for select to authenticated
using(private.is_organization_member(organization_id,'member'));
create policy "admins manage provider departments"
on public.provider_departments for all to authenticated
using(private.is_organization_member(organization_id,'admin'))
with check(private.is_organization_member(organization_id,'admin'));

comment on table public.clinic_departments is 'Tenant-scoped department and specialty navigation for multi-doctor clinic booking.';
comment on table public.provider_departments is 'Tenant-safe provider-to-department assignments used by web and WhatsApp booking funnels.';
