-- Opt-in device endpoints for privacy-safe OmniRelay serious-action alerts.
-- No patient identity or clinical content is stored in this table.

create table if not exists public.device_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (endpoint like 'https://%'),
  p256dh_key text not null check (length(p256dh_key) between 16 and 512),
  auth_key text not null check (length(auth_key) between 8 and 256),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, endpoint)
);

create index if not exists device_push_subscriptions_active_recipient_idx
  on public.device_push_subscriptions (organization_id, user_id, updated_at desc)
  where status = 'active';

alter table public.device_push_subscriptions enable row level security;
revoke all on public.device_push_subscriptions from anon;
grant select, insert, update on public.device_push_subscriptions to authenticated;

create policy "members manage own device push subscriptions"
on public.device_push_subscriptions for select to authenticated
using (user_id = (select auth.uid()));

create policy "members add own device push subscriptions"
on public.device_push_subscriptions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.agents a
    where a.organization_id = device_push_subscriptions.organization_id
      and a.user_id = (select auth.uid())
      and a.ai = false
  )
);

create policy "members revoke own device push subscriptions"
on public.device_push_subscriptions for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

comment on table public.device_push_subscriptions is
  'User-consented device endpoints for privacy-safe serious-action push notifications. Never stores patient data.';
