-- Create retail_content_calendar table
create table public.retail_content_calendar (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  
  post_date date not null,
  content_format text not null check (content_format in ('reel', 'carousel', 'story')),
  strategic_goal text not null check (strategic_goal in ('reach', 'depth', 'retention')),
  
  -- Optional reference to the AI generated asset
  creative_id uuid references public.retail_creatives(id) on delete set null,
  
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Index for querying by date
create index idx_content_calendar_date on public.retail_content_calendar(organization_id, post_date);

-- Enable RLS
alter table public.retail_content_calendar enable row level security;

-- Policies
create policy "members read content calendar" 
  on public.retail_content_calendar for select to authenticated 
  using (private.is_organization_member(organization_id, 'member'));

create policy "admins update content calendar" 
  on public.retail_content_calendar for update to authenticated 
  using (private.is_organization_member(organization_id, 'admin'));

create policy "admins insert content calendar" 
  on public.retail_content_calendar for insert to authenticated 
  with check (private.is_organization_member(organization_id, 'admin'));

create policy "admins delete content calendar" 
  on public.retail_content_calendar for delete to authenticated 
  using (private.is_organization_member(organization_id, 'admin'));

create trigger set_retail_content_calendar_updated_at
  before update on public.retail_content_calendar
  for each row
  execute function public.set_updated_at();
