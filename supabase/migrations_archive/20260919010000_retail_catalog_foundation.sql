create table public.retail_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  price numeric not null check (price >= 0),
  currency text not null default 'INR',
  image_url text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Index for fast lookup by organization
create index idx_retail_catalog_org on public.retail_catalog(organization_id);

-- Enable RLS
alter table public.retail_catalog enable row level security;

-- RLS Policies
create policy "members read retail catalog" 
  on public.retail_catalog 
  for select 
  to authenticated 
  using (private.is_organization_member(organization_id, 'member'));

create policy "admins insert retail catalog" 
  on public.retail_catalog 
  for insert 
  to authenticated 
  with check (private.is_organization_member(organization_id, 'admin'));

create policy "admins update retail catalog" 
  on public.retail_catalog 
  for update 
  to authenticated 
  using (private.is_organization_member(organization_id, 'admin'))
  with check (private.is_organization_member(organization_id, 'admin'));

create policy "admins delete retail catalog" 
  on public.retail_catalog 
  for delete 
  to authenticated 
  using (private.is_organization_member(organization_id, 'admin'));

-- Set up trigger for updated_at
create trigger set_retail_catalog_updated_at
  before update on public.retail_catalog
  for each row
  execute function public.set_updated_at();
