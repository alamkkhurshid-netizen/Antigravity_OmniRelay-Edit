-- OmniRelay operational billing foundation.
-- This release is deliberately shadow-only: it records usage but never charges,
-- blocks, reserves, or alters client communication.

create table if not exists public.operational_billing_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  mode text not null default 'shadow' check (mode in ('shadow', 'active')),
  charging_enabled boolean not null default false,
  send_blocking_enabled boolean not null default false,
  warning_threshold_paise integer not null default 50000 check (warning_threshold_paise >= 0),
  critical_threshold_paise integer not null default 20000 check (critical_threshold_paise >= 0),
  activated_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint operational_billing_shadow_guard check (
    mode = 'active' or (charging_enabled = false and send_blocking_enabled = false and activated_at is null)
  )
);

create table if not exists public.operational_wallets (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  balance_paise bigint not null default 0 check (balance_paise >= 0),
  reserved_paise bigint not null default 0 check (reserved_paise >= 0),
  updated_at timestamptz not null default now(),
  constraint operational_wallet_available_balance check (reserved_paise <= balance_paise)
);

create table if not exists public.whatsapp_rate_cards (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'rcs', 'instagram')),
  country_code text not null default 'IN',
  message_category text not null check (message_category in ('utility', 'marketing', 'authentication', 'service')),
  base_rate_paise integer not null check (base_rate_paise >= 0),
  platform_fee_paise integer not null default 0 check (platform_fee_paise >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  source_url text not null,
  source_version text not null,
  effective_at timestamptz not null,
  expires_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint whatsapp_rate_card_window check (expires_at is null or expires_at > effective_at)
);
create unique index if not exists active_operational_rate_card_per_category
  on public.whatsapp_rate_cards(channel, country_code, message_category)
  where active;

create table if not exists public.operational_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null check (source_type in ('appointment_reminder', 'care_reminder', 'campaign', 'doctor_queue', 'creative')),
  source_id uuid not null,
  provider_message_id text,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'rcs', 'instagram')),
  message_category text not null check (message_category in ('utility', 'marketing', 'authentication', 'service', 'creative')),
  delivery_status text not null default 'sent' check (delivery_status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  rate_card_id uuid references public.whatsapp_rate_cards(id) on delete set null,
  base_cost_paise integer not null default 0 check (base_cost_paise >= 0),
  platform_fee_paise integer not null default 0 check (platform_fee_paise >= 0),
  estimated_total_paise integer not null default 0 check (estimated_total_paise >= 0),
  charged_total_paise integer not null default 0 check (charged_total_paise >= 0),
  occurred_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(source_type, source_id)
);
create unique index if not exists operational_usage_provider_message_unique
  on public.operational_usage_events(provider_message_id)
  where provider_message_id is not null;
create index if not exists operational_usage_events_org_time_idx
  on public.operational_usage_events(organization_id, occurred_at desc);

create table if not exists public.operational_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entry_type text not null check (entry_type in ('top_up', 'reserve', 'capture', 'release', 'reversal', 'adjustment')),
  amount_paise bigint not null check (amount_paise <> 0),
  balance_after_paise bigint not null check (balance_after_paise >= 0),
  reference_type text not null,
  reference_id text not null,
  description text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(organization_id, reference_type, reference_id, entry_type)
);
create index if not exists operational_wallet_ledger_org_time_idx
  on public.operational_wallet_ledger(organization_id, created_at desc);

alter table public.operational_billing_settings enable row level security;
alter table public.operational_wallets enable row level security;
alter table public.whatsapp_rate_cards enable row level security;
alter table public.operational_usage_events enable row level security;
alter table public.operational_wallet_ledger enable row level security;
revoke all on public.operational_billing_settings, public.operational_wallets, public.whatsapp_rate_cards, public.operational_usage_events, public.operational_wallet_ledger from public, anon, authenticated;
grant select on public.operational_billing_settings, public.operational_wallets, public.operational_usage_events, public.operational_wallet_ledger to authenticated;

create policy "organization members read operational billing settings" on public.operational_billing_settings for select to authenticated using (private.is_organization_member(organization_id, 'member'));
create policy "organization members read operational wallets" on public.operational_wallets for select to authenticated using (private.is_organization_member(organization_id, 'member'));
create policy "organization members read operational usage" on public.operational_usage_events for select to authenticated using (private.is_organization_member(organization_id, 'member'));
create policy "organization members read operational ledger" on public.operational_wallet_ledger for select to authenticated using (private.is_organization_member(organization_id, 'member'));

insert into public.operational_billing_settings(organization_id)
select id from public.organizations on conflict do nothing;
insert into public.operational_wallets(organization_id)
select id from public.organizations on conflict do nothing;

create or replace function private.initialize_operational_billing_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.operational_billing_settings(organization_id) values(new.id) on conflict do nothing;
  insert into public.operational_wallets(organization_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.initialize_operational_billing_workspace() from public, anon, authenticated;
drop trigger if exists initialize_operational_billing_workspace on public.organizations;
create trigger initialize_operational_billing_workspace after insert on public.organizations for each row execute function private.initialize_operational_billing_workspace();

create or replace function private.record_shadow_operational_usage(
  p_organization_id uuid, p_source_type text, p_source_id uuid, p_provider_message_id text,
  p_category text, p_status text, p_occurred_at timestamptz default now()
) returns void language plpgsql security definer set search_path = '' as $$
declare v_rate public.whatsapp_rate_cards%rowtype;
begin
  -- Shadow usage intentionally writes no wallet ledger and never checks balance.
  select * into v_rate from public.whatsapp_rate_cards
  where channel='whatsapp' and country_code='IN' and message_category=p_category
    and active and effective_at <= p_occurred_at and (expires_at is null or expires_at > p_occurred_at)
  order by effective_at desc limit 1;

  insert into public.operational_usage_events(
    organization_id,source_type,source_id,provider_message_id,message_category,delivery_status,
    rate_card_id,base_cost_paise,platform_fee_paise,estimated_total_paise,occurred_at,updated_at,
    metadata
  ) values (
    p_organization_id,p_source_type,p_source_id,nullif(p_provider_message_id,''),p_category,p_status,
    v_rate.id,coalesce(v_rate.base_rate_paise,0),coalesce(v_rate.platform_fee_paise,0),
    coalesce(v_rate.base_rate_paise,0)+coalesce(v_rate.platform_fee_paise,0),p_occurred_at,now(),
    jsonb_build_object('billing_mode','shadow','rate_status',case when v_rate.id is null then 'unconfigured' else 'estimated' end)
  ) on conflict(source_type,source_id) do update set
    provider_message_id=coalesce(excluded.provider_message_id,public.operational_usage_events.provider_message_id),
    delivery_status=excluded.delivery_status,
    updated_at=now();
end;
$$;
revoke all on function private.record_shadow_operational_usage(uuid,text,uuid,text,text,text,timestamptz) from public, anon, authenticated;

create or replace function private.observe_shadow_reminder_usage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.provider_message_id is not null and new.status in ('sent','delivered','read','failed') then
    perform private.record_shadow_operational_usage(new.organization_id,'appointment_reminder',new.id,new.provider_message_id,'utility',new.status,coalesce(new.sent_at,new.updated_at,now()));
  end if;
  return new;
end;
$$;
revoke all on function private.observe_shadow_reminder_usage() from public, anon, authenticated;
drop trigger if exists observe_shadow_reminder_usage on public.reminder_events;
create trigger observe_shadow_reminder_usage after insert or update of status, provider_message_id on public.reminder_events for each row execute function private.observe_shadow_reminder_usage();

create or replace function private.observe_shadow_campaign_usage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.provider_message_id is not null and new.status in ('sent','delivered','read','failed') then
    perform private.record_shadow_operational_usage(new.organization_id,'campaign',new.id,new.provider_message_id,'marketing',new.status,coalesce(new.sent_at,new.updated_at,now()));
  end if;
  return new;
end;
$$;
revoke all on function private.observe_shadow_campaign_usage() from public, anon, authenticated;
drop trigger if exists observe_shadow_campaign_usage on public.campaign_recipients;
create trigger observe_shadow_campaign_usage after insert or update of status, provider_message_id on public.campaign_recipients for each row execute function private.observe_shadow_campaign_usage();

create or replace function private.observe_shadow_doctor_queue_usage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.provider_message_id is not null and new.status in ('sent','delivered','read','failed') then
    perform private.record_shadow_operational_usage(new.organization_id,'doctor_queue',new.id,new.provider_message_id,'utility',new.status,coalesce(new.sent_at,new.updated_at,now()));
  end if;
  return new;
end;
$$;
revoke all on function private.observe_shadow_doctor_queue_usage() from public, anon, authenticated;
drop trigger if exists observe_shadow_doctor_queue_usage on public.doctor_queue_dispatches;
create trigger observe_shadow_doctor_queue_usage after insert or update of status, provider_message_id on public.doctor_queue_dispatches for each row execute function private.observe_shadow_doctor_queue_usage();
