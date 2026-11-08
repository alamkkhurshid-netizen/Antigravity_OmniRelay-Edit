-- Add Meta integration fields to organizations
alter table public.organizations
add column if not exists meta_pixel_id text,
add column if not exists meta_access_token text;

-- Create marketing_campaigns table
create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  daily_budget numeric,
  meta_campaign_id text,
  roas numeric,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index idx_marketing_campaigns_org on public.marketing_campaigns(organization_id);

alter table public.marketing_campaigns enable row level security;

create policy "members read marketing campaigns" 
  on public.marketing_campaigns for select to authenticated 
  using (private.is_organization_member(organization_id, 'member'));

create policy "admins insert marketing campaigns" 
  on public.marketing_campaigns for insert to authenticated 
  with check (private.is_organization_member(organization_id, 'admin'));

create policy "admins update marketing campaigns" 
  on public.marketing_campaigns for update to authenticated 
  using (private.is_organization_member(organization_id, 'admin'));

create policy "admins delete marketing campaigns" 
  on public.marketing_campaigns for delete to authenticated 
  using (private.is_organization_member(organization_id, 'admin'));

create trigger set_marketing_campaigns_updated_at
  before update on public.marketing_campaigns
  for each row
  execute function public.set_updated_at();
