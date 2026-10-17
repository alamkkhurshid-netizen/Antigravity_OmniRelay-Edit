-- Create retail_creatives table
create table public.retail_creatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_url text not null,
  angle text not null check (angle in ('pain', 'social_proof', 'us_vs_them', 'curiosity')),
  video_url text,
  hook_script text not null,
  engine text not null default 'topview' check (engine in ('topview', 'higgsfield')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index idx_retail_creatives_org on public.retail_creatives(organization_id);

alter table public.retail_creatives enable row level security;

create policy "members read retail creatives" 
  on public.retail_creatives for select to authenticated 
  using (private.is_organization_member(organization_id, 'member'));

create policy "admins insert retail creatives" 
  on public.retail_creatives for insert to authenticated 
  with check (private.is_organization_member(organization_id, 'admin'));

create policy "admins update retail creatives" 
  on public.retail_creatives for update to authenticated 
  using (private.is_organization_member(organization_id, 'admin'));

create policy "admins delete retail creatives" 
  on public.retail_creatives for delete to authenticated 
  using (private.is_organization_member(organization_id, 'admin'));

create trigger set_retail_creatives_updated_at
  before update on public.retail_creatives
  for each row
  execute function public.set_updated_at();
