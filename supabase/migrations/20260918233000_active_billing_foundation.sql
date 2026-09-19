-- Active Billing & Wallet Engine Foundation
-- Migrates from shadow billing to a strict prepaid ledger.

begin;

  create schema if not exists billing;

  -- 1. Tenant Wallets (Strict isolation)
  create table if not exists billing.tenant_wallets (
    organization_id uuid primary key references public.organizations(id) on delete cascade,
    balance_paise bigint not null default 0,
    warning_threshold_paise bigint not null default 50000, -- ₹500
    critical_threshold_paise bigint not null default 10000, -- ₹100
    updated_at timestamptz not null default now()
  );

  alter table billing.tenant_wallets enable row level security;
  
  create policy "Tenants can only view their own wallet"
  on billing.tenant_wallets for select
  to authenticated
  using (private.is_organization_member(organization_id, 'member'));

  -- No insert/update policies for tenants. Only RPCs/service-roles can modify wallets.

  -- 2. Message Ledger (Atomic deduction logs)
  create table if not exists billing.message_ledger (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    meta_message_id text not null, -- WhatsApp Message ID for idempotency
    channel text not null default 'whatsapp',
    category text not null,
    base_cost_paise bigint not null,
    platform_markup_paise bigint not null,
    total_deducted_paise bigint not null,
    created_at timestamptz not null default now(),
    unique (organization_id, meta_message_id) -- Prevents double-deduction on webhook retry
  );

  alter table billing.message_ledger enable row level security;

  create policy "Tenants can view their own ledger"
  on billing.message_ledger for select
  to authenticated
  using (private.is_organization_member(organization_id, 'member'));

  -- 3. Wallet Transactions (Top-ups)
  create table if not exists billing.wallet_transactions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    amount_paise bigint not null,
    transaction_type text not null check (transaction_type in ('top_up', 'refund', 'adjustment')),
    razorpay_payment_id text, -- Used for idempotency
    status text not null default 'success',
    created_at timestamptz not null default now(),
    unique (razorpay_payment_id) -- Prevents double-crediting
  );

  alter table billing.wallet_transactions enable row level security;

  create policy "Tenants can view their own transactions"
  on billing.wallet_transactions for select
  to authenticated
  using (private.is_organization_member(organization_id, 'member'));

  -- 4. Meta Rate Card (Single source of truth for base rates)
  create table if not exists billing.meta_rate_card (
    id uuid primary key default gen_random_uuid(),
    country_code text not null,
    category text not null,
    base_rate_paise bigint not null,
    effective_from timestamptz not null default now(),
    unique (country_code, category)
  );

  alter table billing.meta_rate_card enable row level security;
  
  create policy "Meta rates are publicly readable"
  on billing.meta_rate_card for select
  to authenticated
  using (true);

  -- 5. Tenant Pricing Tiers (Volume-based markups)
  create table if not exists billing.tenant_pricing_tiers (
    organization_id uuid primary key references public.organizations(id) on delete cascade,
    tier_name text not null default 'starter',
    markup_percentage numeric(5, 2) not null default 20.00,
    calculated_at timestamptz not null default now()
  );

  alter table billing.tenant_pricing_tiers enable row level security;

  create policy "Tenants can view their own tier"
  on billing.tenant_pricing_tiers for select
  to authenticated
  using (private.is_organization_member(organization_id, 'member'));

  -- Seed Official Meta Rates for India (Oct 2026 rates in Paise)
  insert into billing.meta_rate_card (country_code, category, base_rate_paise)
  values 
    ('IN', 'marketing', 89), -- ~₹0.89
    ('IN', 'utility', 14),   -- ~₹0.14
    ('IN', 'service', 8),    -- ~₹0.08
    ('IN', 'authentication', 12) -- ~₹0.12
  on conflict (country_code, category) do update
  set base_rate_paise = excluded.base_rate_paise;

commit;
