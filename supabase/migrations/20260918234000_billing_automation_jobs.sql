-- Billing Automation Jobs (Phase 3 & 4)
-- This creates the schema and functions for monthly Tier calculation and Reconciliation.

begin;

  -- 1. Reconciliation Table
  create table if not exists billing.billing_reconciliation (
    id uuid primary key default gen_random_uuid(),
    period_start timestamptz not null,
    period_end timestamptz not null,
    meta_invoice_total_paise bigint not null,
    ledger_base_total_paise bigint not null,
    variance_paise bigint not null,
    status text not null default 'pending_review' check (status in ('pending_review', 'resolved', 'auto_approved')),
    created_at timestamptz not null default now()
  );

  -- 2. Phase 3: Volume Rewards Tier Calculation
  -- Runs on the 1st of every month to adjust markup tiers based on spend
  create or replace function billing.calculate_monthly_tiers()
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    -- Example Tier Logic:
    -- Spend > ₹2,000 (200000 paise) = Pro Tier (15% markup)
    -- Spend < ₹2,000 = Starter Tier (20% markup)
    
    insert into billing.tenant_pricing_tiers (organization_id, tier_name, markup_percentage, calculated_at)
    select 
      t.organization_id,
      case 
        when sum(t.amount_paise) >= 200000 then 'pro'
        else 'starter'
      end as tier_name,
      case 
        when sum(t.amount_paise) >= 200000 then 15.00
        else 20.00
      end as markup_percentage,
      now()
    from billing.wallet_transactions t
    where t.transaction_type = 'top_up'
      and t.created_at >= date_trunc('month', current_date - interval '1 month')
      and t.created_at < date_trunc('month', current_date)
    group by t.organization_id
    on conflict (organization_id) do update
    set 
      tier_name = excluded.tier_name,
      markup_percentage = excluded.markup_percentage,
      calculated_at = excluded.calculated_at;
  end;
  $$;

  -- 3. Phase 4: Monthly Ledger Reconciliation
  -- Compares what we logged vs what Meta actually charged us
  create or replace function billing.run_reconciliation(
    p_period_start timestamptz,
    p_period_end timestamptz,
    p_meta_invoice_total_paise bigint
  )
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    v_ledger_total bigint;
    v_variance bigint;
    v_status text;
    v_reconciliation_id uuid;
  begin
    -- Sum all base costs across all tenants for the period
    select coalesce(sum(base_cost_paise), 0) into v_ledger_total
    from billing.message_ledger
    where created_at >= p_period_start and created_at < p_period_end;

    v_variance := abs(p_meta_invoice_total_paise - v_ledger_total);
    
    -- If variance is less than 2%, auto-approve it. Otherwise flag for review.
    if v_variance <= (p_meta_invoice_total_paise * 0.02) then
      v_status := 'auto_approved';
    else
      v_status := 'pending_review';
    end if;

    insert into billing.billing_reconciliation (
      period_start, period_end, meta_invoice_total_paise, ledger_base_total_paise, variance_paise, status
    ) values (
      p_period_start, p_period_end, p_meta_invoice_total_paise, v_ledger_total, v_variance, v_status
    ) returning id into v_reconciliation_id;

    return v_reconciliation_id;
  end;
  $$;

commit;
