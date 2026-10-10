-- Migration: Add multi-minute quantity support to billing.record_and_deduct
-- Fixes underbilling of multi-minute voice calls (e.g., 5 min call was billed as 1 pulse)

CREATE OR REPLACE FUNCTION billing.record_and_deduct(
    p_organization_id UUID,
    p_meta_message_id TEXT,
    p_category TEXT,
    p_channel TEXT DEFAULT 'whatsapp',
    p_country_code TEXT DEFAULT 'IN',
    p_quantity INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_base_rate BIGINT := 12;
    v_markup_pct NUMERIC := 25.00;
    v_markup_paise BIGINT := 3;
    v_total_deduction BIGINT := 15;
    v_current_balance BIGINT := 0;
    v_warning_threshold BIGINT := 50000;
    v_critical_threshold BIGINT := 20000;
    v_warning_triggered BOOLEAN := FALSE;
    v_critical_triggered BOOLEAN := FALSE;
    v_ledger_id UUID;
    v_qty INTEGER := GREATEST(1, COALESCE(p_quantity, 1));
BEGIN
    -- 1. Idempotency Check: if already recorded in ledger, do not deduct again
    IF EXISTS (
        SELECT 1 FROM billing.message_ledger 
        WHERE meta_message_id = p_meta_message_id
    ) THEN
        SELECT balance_paise INTO v_current_balance
        FROM billing.tenant_wallets
        WHERE organization_id = p_organization_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'already_deducted', TRUE,
            'organization_id', p_organization_id,
            'meta_message_id', p_meta_message_id,
            'balance_paise', COALESCE(v_current_balance, 0)
        );
    END IF;

    -- 2. Fetch Rate Card
    SELECT base_rate_paise INTO v_base_rate
    FROM billing.meta_rate_card
    WHERE channel = p_channel 
      AND country_code = p_country_code 
      AND category = p_category
      AND active = TRUE;

    IF v_base_rate IS NULL THEN
        IF p_category = 'marketing' THEN v_base_rate := 78;
        ELSIF p_category = 'voice' THEN v_base_rate := 250;
        ELSE v_base_rate := 12;
        END IF;
    END IF;

    -- 3. Fetch Markup Tier
    SELECT markup_percentage INTO v_markup_pct
    FROM billing.tenant_pricing_tiers
    WHERE organization_id = p_organization_id;

    IF v_markup_pct IS NULL THEN
        IF p_category = 'marketing' THEN v_markup_pct := 22.00;
        ELSE v_markup_pct := 25.00;
        END IF;
    END IF;

    -- Calculate per-unit markup and multiply total deduction by quantity (e.g. minutes)
    v_markup_paise := ROUND(v_base_rate * (v_markup_pct / 100.00))::BIGINT;
    v_total_deduction := (v_base_rate + v_markup_paise) * v_qty;

    -- 4. Ensure Wallet Exists and Acquire Row-Level Lock
    INSERT INTO billing.tenant_wallets (organization_id, balance_paise)
    VALUES (p_organization_id, 0)
    ON CONFLICT (organization_id) DO NOTHING;

    SELECT balance_paise, warning_threshold_paise, critical_threshold_paise
    INTO v_current_balance, v_warning_threshold, v_critical_threshold
    FROM billing.tenant_wallets
    WHERE organization_id = p_organization_id
    FOR UPDATE;

    -- 5. Deduct Balance
    v_current_balance := v_current_balance - v_total_deduction;

    UPDATE billing.tenant_wallets
    SET 
        balance_paise = v_current_balance,
        updated_at = NOW()
    WHERE organization_id = p_organization_id;

    -- 6. Insert into message ledger with quantity accounting
    INSERT INTO billing.message_ledger (
        organization_id,
        meta_message_id,
        channel,
        category,
        base_cost_paise,
        platform_markup_paise,
        total_deducted_paise,
        balance_after_paise,
        delivery_status
    )
    VALUES (
        p_organization_id,
        p_meta_message_id,
        p_channel,
        p_category,
        v_base_rate * v_qty,
        v_markup_paise * v_qty,
        v_total_deduction,
        v_current_balance,
        'delivered'
    )
    RETURNING id INTO v_ledger_id;

    -- 7. Check if thresholds were crossed
    IF v_current_balance < v_critical_threshold THEN
        v_critical_triggered := TRUE;
    ELSIF v_current_balance < v_warning_threshold THEN
        v_warning_triggered := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'already_deducted', FALSE,
        'ledger_id', v_ledger_id,
        'organization_id', p_organization_id,
        'meta_message_id', p_meta_message_id,
        'units_billed', v_qty,
        'deducted_paise', v_total_deduction,
        'new_balance_paise', v_current_balance,
        'warning_triggered', v_warning_triggered,
        'critical_triggered', v_critical_triggered
    );
END;
$$;
