-- Billing controls foundation. Every commercial control remains disabled in shadow mode.
alter table public.operational_billing_settings
  add column if not exists wallet_topups_enabled boolean not null default false,
  add column if not exists creative_billing_enabled boolean not null default false,
  add column if not exists rate_activation_enabled boolean not null default false,
  add constraint operational_billing_commercial_lock check (
    mode = 'active' or (wallet_topups_enabled = false and creative_billing_enabled = false and rate_activation_enabled = false)
  );

create table if not exists public.operational_topup_intents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  amount_paise bigint not null check (amount_paise > 0), provider text not null default 'razorpay', status text not null default 'disabled' check (status in ('disabled','created','paid','failed','refunded')),
  provider_reference text, created_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.operational_statements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null, period_end date not null, status text not null default 'draft' check (status in ('draft','issued','void')),
  usage_total_paise numeric(16,4) not null default 0, wallet_movement_paise bigint not null default 0,
  created_at timestamptz not null default now(), unique(organization_id,period_start,period_end)
);
create table if not exists public.operational_rate_card_audit (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, rate_card_id uuid references public.whatsapp_rate_cards(id) on delete set null,
  action text not null check (action in ('draft_created','source_updated','verified','activation_requested','retired')),
  source_url text not null, source_version text not null, actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.operational_creative_reservations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  creative_kind text not null check (creative_kind in ('image','video')), amount_paise bigint not null check (amount_paise >= 0),
  status text not null default 'disabled' check (status in ('disabled','reserved','captured','released','failed')),
  reference_id text unique, created_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.operational_reconciliation_runs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null, period_end date not null, status text not null default 'not_started' check (status in ('not_started','in_review','reconciled','variance_found')),
  meta_bill_paise bigint, razorpay_settlement_paise bigint, ledger_total_paise bigint, variance_paise bigint,
  created_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references auth.users(id) on delete set null,
  unique(organization_id,period_start,period_end)
);

alter table public.operational_topup_intents enable row level security;
alter table public.operational_statements enable row level security;
alter table public.operational_rate_card_audit enable row level security;
alter table public.operational_creative_reservations enable row level security;
alter table public.operational_reconciliation_runs enable row level security;
revoke all on public.operational_topup_intents,public.operational_statements,public.operational_rate_card_audit,public.operational_creative_reservations,public.operational_reconciliation_runs from public,anon,authenticated;
grant select on public.operational_topup_intents,public.operational_statements,public.operational_creative_reservations,public.operational_reconciliation_runs to authenticated;
grant select on public.operational_rate_card_audit to authenticated;
create policy "members read topup intents" on public.operational_topup_intents for select to authenticated using (private.is_organization_member(organization_id,'member'));
create policy "members read statements" on public.operational_statements for select to authenticated using (private.is_organization_member(organization_id,'member'));
create policy "members read creative reservations" on public.operational_creative_reservations for select to authenticated using (private.is_organization_member(organization_id,'member'));
create policy "members read reconciliations" on public.operational_reconciliation_runs for select to authenticated using (private.is_organization_member(organization_id,'member'));
create policy "owners read rate audit" on public.operational_rate_card_audit for select to authenticated using (private.is_organization_member(organization_id,'owner'));

-- Future owner-only workflow: stages an auditable draft and explicitly refuses activation.
create or replace function private.stage_operational_rate_card(p_organization_id uuid,p_channel text,p_country text,p_category text,p_rate numeric,p_source_url text,p_source_version text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not private.is_organization_member(p_organization_id,'owner') then raise exception 'Owner access required'; end if;
  insert into public.whatsapp_rate_cards(channel,country_code,message_category,base_rate_paise,platform_fee_paise,currency,source_url,source_version,effective_at,active,verification_status)
  values(p_channel,p_country,p_category,p_rate,0,'INR',p_source_url,p_source_version,now(),false,'draft') returning id into v_id;
  insert into public.operational_rate_card_audit(organization_id,rate_card_id,action,source_url,source_version,actor_id) values(p_organization_id,v_id,'draft_created',p_source_url,p_source_version,(select auth.uid()));
  return v_id;
end; $$;
revoke all on function private.stage_operational_rate_card(uuid,text,text,text,numeric,text,text) from public,anon,authenticated;
