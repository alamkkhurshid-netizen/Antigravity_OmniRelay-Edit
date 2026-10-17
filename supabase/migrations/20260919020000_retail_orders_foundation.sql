-- Create retail_orders table
create table public.retail_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  customer_address text,
  status text not null default 'new' check (status in ('new', 'packing', 'shipping', 'completed', 'cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'cod')),
  total_amount numeric not null default 0 check (total_amount >= 0),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Index for fast lookup by organization and status
create index idx_retail_orders_org on public.retail_orders(organization_id, status);

-- Enable RLS
alter table public.retail_orders enable row level security;

-- RLS Policies for retail_orders
create policy "members read retail orders" 
  on public.retail_orders 
  for select 
  to authenticated 
  using (private.is_organization_member(organization_id, 'member'));

create policy "admins insert retail orders" 
  on public.retail_orders 
  for insert 
  to authenticated 
  with check (private.is_organization_member(organization_id, 'admin'));

create policy "admins update retail orders" 
  on public.retail_orders 
  for update 
  to authenticated 
  using (private.is_organization_member(organization_id, 'admin'))
  with check (private.is_organization_member(organization_id, 'admin'));

-- Set up trigger for updated_at
create trigger set_retail_orders_updated_at
  before update on public.retail_orders
  for each row
  execute function public.set_updated_at();

-- Create retail_order_items table
create table public.retail_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.retail_orders(id) on delete cascade,
  catalog_id uuid references public.retail_catalog(id) on delete set null,
  product_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  created_at timestamp with time zone not null default now()
);

-- Index for fast lookup by order
create index idx_retail_order_items_order on public.retail_order_items(order_id);

-- Enable RLS
alter table public.retail_order_items enable row level security;

-- RLS Policies for retail_order_items
create policy "members read retail order items" 
  on public.retail_order_items 
  for select 
  to authenticated 
  using (private.is_organization_member(organization_id, 'member'));

create policy "admins insert retail order items" 
  on public.retail_order_items 
  for insert 
  to authenticated 
  with check (private.is_organization_member(organization_id, 'admin'));

create policy "admins update retail order items" 
  on public.retail_order_items 
  for update 
  to authenticated 
  using (private.is_organization_member(organization_id, 'admin'))
  with check (private.is_organization_member(organization_id, 'admin'));
