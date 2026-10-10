-- Retail Customer CRM View
-- This view aggregates orders by customer phone to create a real-time CRM without duplicating data
create or replace view public.retail_customers_view as
select 
  organization_id,
  customer_phone as phone,
  max(customer_name) as name, -- gets the most recently used name (or an arbitrary one)
  count(id) as total_orders,
  sum(total_amount) as total_spent,
  max(created_at) as last_order_date
from public.retail_orders
group by organization_id, customer_phone;

-- Create Retail Broadcasts table
create table public.retail_broadcasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  template_text text not null, -- simplified for now instead of complex template IDs
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'completed', 'cancelled')),
  scheduled_for timestamp with time zone,
  audience_type text not null default 'all_customers' check (audience_type in ('all_customers', 'custom')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index idx_retail_broadcasts_org on public.retail_broadcasts(organization_id, status);

alter table public.retail_broadcasts enable row level security;

create policy "members read retail broadcasts" 
  on public.retail_broadcasts for select to authenticated 
  using (private.is_organization_member(organization_id, 'member'));

create policy "admins insert retail broadcasts" 
  on public.retail_broadcasts for insert to authenticated 
  with check (private.is_organization_member(organization_id, 'admin'));

create policy "admins update retail broadcasts" 
  on public.retail_broadcasts for update to authenticated 
  using (private.is_organization_member(organization_id, 'admin'));


-- Create Retail Broadcast Recipients table
create table public.retail_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.retail_broadcasts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_phone text not null,
  customer_name text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_message text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create index idx_retail_broadcast_recip_bcast on public.retail_broadcast_recipients(broadcast_id);
create index idx_retail_broadcast_recip_org on public.retail_broadcast_recipients(organization_id, status);

alter table public.retail_broadcast_recipients enable row level security;

create policy "members read retail broadcast recipients" 
  on public.retail_broadcast_recipients for select to authenticated 
  using (private.is_organization_member(organization_id, 'member'));

create policy "admins insert retail broadcast recipients" 
  on public.retail_broadcast_recipients for insert to authenticated 
  with check (private.is_organization_member(organization_id, 'admin'));

create policy "admins update retail broadcast recipients" 
  on public.retail_broadcast_recipients for update to authenticated 
  using (private.is_organization_member(organization_id, 'admin'));

-- Trigger for updated_at on broadcasts
create trigger set_retail_broadcasts_updated_at
  before update on public.retail_broadcasts
  for each row
  execute function public.set_updated_at();

-- Retail Flows table (Phase 3)
create table public.retail_flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_active boolean not null default false,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index idx_retail_flows_org on public.retail_flows(organization_id);

alter table public.retail_flows enable row level security;

create policy "members read retail flows" 
  on public.retail_flows for select to authenticated 
  using (private.is_organization_member(organization_id, 'member'));

create policy "admins insert retail flows" 
  on public.retail_flows for insert to authenticated 
  with check (private.is_organization_member(organization_id, 'admin'));

create policy "admins update retail flows" 
  on public.retail_flows for update to authenticated 
  using (private.is_organization_member(organization_id, 'admin'));

create trigger set_retail_flows_updated_at
  before update on public.retail_flows
  for each row
  execute function public.set_updated_at();
