-- ==============================================================================
-- Migration: Hardening Billing Idempotency, RPC Permissions & Rate Card Alignment
-- CTO Remediation Brief: P0 Items 3, 4, 5
-- ==============================================================================

-- 1. Ensure schema integrity on billing tables
ALTER TABLE billing.meta_rate_card 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE billing.message_ledger
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS unit_rate_paise BIGINT;

ALTER TABLE public.voice_call_logs
ADD COLUMN IF NOT EXISTS billing_deducted BOOLEAN DEFAULT FALSE;

-- 2. Drop legacy 5-argument function overload to prevent signature confusion and ambiguity
DROP FUNCTION IF EXISTS billing.record_and_deduct(UUID, TEXT, TEXT, TEXT, TEXT);

-- 3. Replace billing.record_and_deduct with idempotent, role-secured 6-argument implementation
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
    v_unit_rate_paise BIGINT := 15;
    v_total_deduction BIGINT := 15;
    v_current_balance BIGINT := 0;
    v_warning_threshold BIGINT := 50000;
    v_critical_threshold BIGINT := 20000;
    v_warning_triggered BOOLEAN := FALSE;
    v_critical_triggered BOOLEAN := FALSE;
    v_ledger_id UUID;
    v_qty INTEGER := GREATEST(1, COALESCE(p_quantity, 1));
    v_existing_ledger_id UUID;
    v_existing_deduction BIGINT;
BEGIN
    -- 1. Hardened Idempotency Check:
    -- If already recorded in message_ledger, return the exact original charge and reference
    SELECT id, total_deducted_paise INTO v_existing_ledger_id, v_existing_deduction
    FROM billing.message_ledger 
    WHERE meta_message_id = p_meta_message_id;

    IF v_existing_ledger_id IS NOT NULL THEN
        SELECT balance_paise INTO v_current_balance
        FROM billing.tenant_wallets
        WHERE organization_id = p_organization_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'already_deducted', TRUE,
            'organization_id', p_organization_id,
            'meta_message_id', p_meta_message_id,
            'ledger_id', v_existing_ledger_id,
            'deducted_paise', COALESCE(v_existing_deduction, 0),
            'units_billed', v_qty,
            'balance_paise', COALESCE(v_current_balance, 0),
            'new_balance_paise', COALESCE(v_current_balance, 0)
        );
    END IF;

    -- 2. Fetch Base Rate from Rate Card
    SELECT base_rate_paise INTO v_base_rate
    FROM billing.meta_rate_card
    WHERE channel = p_channel 
      AND country_code = p_country_code 
      AND category = p_category
      AND active = TRUE;

    IF v_base_rate IS NULL THEN
        IF p_category = 'marketing' THEN v_base_rate := 78;
        ELSIF p_category = 'voice' OR p_channel = 'voice' THEN v_base_rate := 399;
        ELSE v_base_rate := 12;
        END IF;
    END IF;

    -- 3. Calculate Retail Pricing & Margin
    IF p_channel = 'voice' OR p_category = 'voice' THEN
        -- Commercial rule: ₹3.99/min (399 paise) is the final agreed customer selling price.
        -- Supplier telecom base cost is ~₹2.50; margin is already built-in.
        -- Prevent additional 25% markup so 5 min call deducts exactly ₹19.95.
        v_markup_pct := 0.00;
        v_markup_paise := 0;
        v_unit_rate_paise := v_base_rate;
        v_total_deduction := v_unit_rate_paise * v_qty;
    ELSE
        -- WhatsApp / SMS dynamic tier markup
        SELECT markup_percentage INTO v_markup_pct
        FROM billing.tenant_pricing_tiers
        WHERE organization_id = p_organization_id;

        IF v_markup_pct IS NULL THEN
            IF p_category = 'marketing' THEN v_markup_pct := 22.00;
            ELSE v_markup_pct := 25.00;
            END IF;
        END IF;

        v_markup_paise := ROUND(v_base_rate * (v_markup_pct / 100.00))::BIGINT;
        v_unit_rate_paise := v_base_rate + v_markup_paise;
        v_total_deduction := v_unit_rate_paise * v_qty;
    END IF;

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

    -- 6. Insert into message ledger with quantity and unit rate accounting
    INSERT INTO billing.message_ledger (
        organization_id,
        meta_message_id,
        channel,
        category,
        base_cost_paise,
        platform_markup_paise,
        total_deducted_paise,
        balance_after_paise,
        delivery_status,
        quantity,
        unit_rate_paise
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
        'delivered',
        v_qty,
        v_unit_rate_paise
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
        'unit_rate_paise', v_unit_rate_paise,
        'deducted_paise', v_total_deduction,
        'new_balance_paise', v_current_balance,
        'warning_triggered', v_warning_triggered,
        'critical_triggered', v_critical_triggered
    );
END;
$$;

-- 4. Restrict RPC permissions: Service Role ONLY
-- Explicitly revoke from PUBLIC, anon, and authenticated to prevent arbitrary tenant wallet drainage
REVOKE ALL ON FUNCTION billing.record_and_deduct(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.record_and_deduct(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION billing.record_and_deduct(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION billing.record_and_deduct(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;
