create table public.trend_intelligence_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_urls text[] not null default '{}',
  report_payload jsonb,
  status text not null default 'scraping' check (status in ('scraping', 'completed', 'failed')),
  error_message text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Indexes for querying by organization and status
create index idx_trend_intelligence_org on public.trend_intelligence_reports(organization_id);
create index idx_trend_intelligence_status on public.trend_intelligence_reports(status);

-- Enable RLS
alter table public.trend_intelligence_reports enable row level security;

-- Policies
create policy "members read trend intelligence" 
  on public.trend_intelligence_reports for select to authenticated 
  using (private.is_organization_member(organization_id, 'member'));

create policy "members insert trend intelligence" 
  on public.trend_intelligence_reports for insert to authenticated 
  with check (private.is_organization_member(organization_id, 'member'));

create policy "members update trend intelligence" 
  on public.trend_intelligence_reports for update to authenticated 
  using (private.is_organization_member(organization_id, 'member'));

-- Trigger for updated_at
create trigger set_trend_intelligence_reports_updated_at
  before update on public.trend_intelligence_reports
  for each row
  execute function public.set_updated_at();
