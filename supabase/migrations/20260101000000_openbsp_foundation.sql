-- Engineered OpenBSP Foundation
-- Reconstructs the missing base tables required by OmniRelay migrations.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  extra jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  extra jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.entitlements (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_id text,
  max_workspaces integer,
  max_seats integer,
  conversations_quota integer,
  channels jsonb default '[]'::jsonb,
  features jsonb default '[]'::jsonb,
  white_label boolean default false,
  status text default 'trialing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  business_category text,
  business_name text,
  timezone text,
  services_offered jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create schema if not exists billing;

create table if not exists billing.tiers (
  id text primary key,
  name text not null,
  level integer not null,
  active boolean not null default true
);

create table if not exists billing.plans (
  id text primary key,
  min_tier integer not null,
  price integer not null,
  billing_cycle text not null,
  is_default boolean not null default false,
  active boolean not null default true
);
