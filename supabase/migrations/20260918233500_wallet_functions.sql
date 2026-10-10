-- Active Billing RPCs (Deduction Engine)
-- Includes strict concurrency locks and idempotency checks.

begin;

  -- 1. Idempotent Wallet Credit (called by Razorpay Webhook)
  create or replace function billing.credit_wallet(
    p_organization_id uuid,
    p_amount_paise bigint,
    p_razorpay_payment_id text
  )
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    v_wallet_exists boolean;
  begin
    -- Check if payment already credited
    if exists (select 1 from billing.wallet_transactions where razorpay_payment_id = p_razorpay_payment_id) then
      return false; -- Already processed, idempotency kicks in
    end if;

    -- Ensure wallet exists
    select exists (select 1 from billing.tenant_wallets where organization_id = p_organization_id) into v_wallet_exists;
    if not v_wallet_exists then
      insert into billing.tenant_wallets (organization_id, balance_paise) values (p_organization_id, 0);
    end if;

    -- Record transaction
    insert into billing.wallet_transactions (organization_id, amount_paise, transaction_type, razorpay_payment_id)
    values (p_organization_id, p_amount_paise, 'top_up', p_razorpay_payment_id);

    -- Credit wallet atomically
    update billing.tenant_wallets
    set 
      balance_paise = balance_paise + p_amount_paise,
      updated_at = now()
    where organization_id = p_organization_id;

    return true;
  end;
  $$;

  -- 2. Block-Before-Send Check (called before Graph API POST)
  create or replace function billing.can_send_message(
    p_organization_id uuid,
    p_category text,
    p_country_code text default 'IN'
  )
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    v_balance_paise bigint;
    v_base_rate bigint;
    v_markup_percent numeric;
    v_estimated_cost bigint;
  begin
    -- 1. Get current balance (default to 0 if wallet missing)
    select coalesce(balance_paise, 0) into v_balance_paise
    from billing.tenant_wallets
    where organization_id = p_organization_id;

    if v_balance_paise is null then
      v_balance_paise := 0;
    end if;

    -- 2. Get Meta rate and tenant markup
    select base_rate_paise into v_base_rate
    from billing.meta_rate_card
    where category = p_category and country_code = p_country_code;

    select coalesce(markup_percentage, 20.00) into v_markup_percent
    from billing.tenant_pricing_tiers
    where organization_id = p_organization_id;

    if v_markup_percent is null then
      v_markup_percent := 20.00;
    end if;

    v_estimated_cost := v_base_rate + (v_base_rate * (v_markup_percent / 100.0))::bigint;

    -- 3. Enforce policies based on category
    if p_category = 'marketing' then
      -- Strict block if not enough funds
      return v_balance_paise >= v_estimated_cost;
    else
      -- Utility/Authentication: allow small negative buffer (-₹50 / -5000 paise)
      return v_balance_paise >= (-5000 + v_estimated_cost);
    end if;
  end;
  $$;

  -- 3. Atomic Deduction (called by Meta Delivery Webhook)
  create or replace function billing.record_and_deduct(
    p_organization_id uuid,
    p_meta_message_id text,
    p_category text,
    p_channel text default 'whatsapp',
    p_country_code text default 'IN'
  )
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    v_base_rate bigint;
    v_markup_percent numeric;
    v_markup_paise bigint;
    v_total_deduction bigint;
    v_current_balance bigint;
  begin
    -- 1. Idempotency Check
    if exists (select 1 from billing.message_ledger where meta_message_id = p_meta_message_id) then
      return false; -- Already deducted
    end if;

    -- 2. Calculate Cost
    select base_rate_paise into v_base_rate
    from billing.meta_rate_card
    where category = p_category and country_code = p_country_code;
    
    if v_base_rate is null then v_base_rate := 15; end if; -- fallback

    select coalesce(markup_percentage, 20.00) into v_markup_percent
    from billing.tenant_pricing_tiers
    where organization_id = p_organization_id;
    
    if v_markup_percent is null then v_markup_percent := 20.00; end if;

    v_markup_paise := (v_base_rate * (v_markup_percent / 100.0))::bigint;
    v_total_deduction := v_base_rate + v_markup_paise;

    -- 3. Ensure wallet exists before locking
    insert into billing.tenant_wallets (organization_id, balance_paise)
    values (p_organization_id, 0)
    on conflict do nothing;

    -- 4. ROW-LEVEL LOCK FOR CONCURRENCY
    -- We lock the wallet row for update so if 20 webhooks fire concurrently, they queue up sequentially.
    select balance_paise into v_current_balance
    from billing.tenant_wallets
    where organization_id = p_organization_id
    for update; 

    -- 5. Deduct Balance
    update billing.tenant_wallets
    set 
      balance_paise = balance_paise - v_total_deduction,
      updated_at = now()
    where organization_id = p_organization_id;

    -- 6. Record Ledger Entry
    insert into billing.message_ledger (
      organization_id, meta_message_id, channel, category, 
      base_cost_paise, platform_markup_paise, total_deducted_paise
    ) values (
      p_organization_id, p_meta_message_id, p_channel, p_category,
      v_base_rate, v_markup_paise, v_total_deduction
    );

    -- TODO: Threshold Alerts could be triggered here via pg_net or edge function call.

    return true;
  end;
  $$;

commit;
