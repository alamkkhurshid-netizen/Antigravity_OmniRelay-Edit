-- ==============================================================================
-- OMNIRELAY PRODUCTION HARDENING: BILLING CONCURRENCY, OAUTH NONCES & WA LEASING
-- 1. pg_advisory_xact_lock serialization on billing.record_and_deduct
-- 2. Durable database table and atomic consumption for OAuth state nonces
-- 3. Atomic retry leasing for inbound WhatsApp message processing
-- ==============================================================================

-- 1. OAuth State Nonces Table
CREATE TABLE IF NOT EXISTS public.oauth_nonces (
    nonce TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    resource_id TEXT,
    provider TEXT NOT NULL DEFAULT 'google_calendar',
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_nonces_org_user ON public.oauth_nonces(organization_id, user_id);
ALTER TABLE public.oauth_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oauth_nonces FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.oauth_nonces TO service_role;

-- Atomic Nonce Consumption Function
CREATE OR REPLACE FUNCTION public.consume_oauth_nonce(
    p_nonce TEXT,
    p_user_id UUID,
    p_org_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated INT;
BEGIN
    UPDATE public.oauth_nonces
    SET consumed_at = NOW()
    WHERE nonce = p_nonce
      AND user_id = p_user_id
      AND organization_id = p_org_id
      AND consumed_at IS NULL
      AND expires_at > NOW();

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_oauth_nonce(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_oauth_nonce(TEXT, UUID, UUID) TO service_role;

-- 2. Atomic WhatsApp Inbound Lease Acquisition Function
CREATE OR REPLACE FUNCTION public.acquire_whatsapp_inbound_lease(
    p_provider_message_id TEXT,
    p_lease_timeout_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated INT;
BEGIN
    UPDATE public.whatsapp_inbound_messages
    SET status = 'processing',
        retry_count = retry_count + 1,
        updated_at = NOW()
    WHERE provider_message_id = p_provider_message_id
      AND (
          status IN ('received', 'queued', 'failed')
          OR (status = 'processing' AND updated_at < NOW() - (p_lease_timeout_seconds || ' seconds')::INTERVAL)
      );

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_whatsapp_inbound_lease(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_whatsapp_inbound_lease(TEXT, INT) TO service_role;

-- 3. Hardened billing.record_and_deduct with Transaction Advisory Locking
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
    -- 1. Acquire transaction-level advisory lock on meta_message_id
    -- Eliminates race conditions across concurrent database workers
    PERFORM pg_advisory_xact_lock(hashtext('billing_deduct:' || p_meta_message_id));

    -- 2. Idempotency Check under Transaction Advisory Lock
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

    -- 3. Fetch Base Rate from Rate Card
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

    -- 4. Calculate Retail Pricing & Margin
    IF p_channel = 'voice' OR p_category = 'voice' THEN
        v_markup_pct := 0.00;
        v_markup_paise := 0;
        v_unit_rate_paise := v_base_rate;
        v_total_deduction := v_unit_rate_paise * v_qty;
    ELSE
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

    -- 5. Ensure Wallet Exists and Acquire Row-Level Lock
    INSERT INTO billing.tenant_wallets (organization_id, balance_paise)
    VALUES (p_organization_id, 0)
    ON CONFLICT (organization_id) DO NOTHING;

    SELECT balance_paise, warning_threshold_paise, critical_threshold_paise
    INTO v_current_balance, v_warning_threshold, v_critical_threshold
    FROM billing.tenant_wallets
    WHERE organization_id = p_organization_id
    FOR UPDATE;

    -- Double-check idempotency once row-level lock is held
    SELECT id, total_deducted_paise INTO v_existing_ledger_id, v_existing_deduction
    FROM billing.message_ledger 
    WHERE meta_message_id = p_meta_message_id;

    IF v_existing_ledger_id IS NOT NULL THEN
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

    -- 6. Deduct Balance
    v_current_balance := v_current_balance - v_total_deduction;

    UPDATE billing.tenant_wallets
    SET 
        balance_paise = v_current_balance,
        updated_at = NOW()
    WHERE organization_id = p_organization_id;

    -- 7. Insert into message ledger with conflict safety
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
    ON CONFLICT (meta_message_id) DO NOTHING
    RETURNING id INTO v_ledger_id;

    -- Fallback to existing ledger row if concurrent insert won race
    IF v_ledger_id IS NULL THEN
        SELECT id, total_deducted_paise INTO v_ledger_id, v_existing_deduction
        FROM billing.message_ledger 
        WHERE meta_message_id = p_meta_message_id;
    END IF;

    -- 8. Threshold Notifications
    IF v_current_balance < v_warning_threshold AND (v_current_balance + v_total_deduction) >= v_warning_threshold THEN
        v_warning_triggered := TRUE;
    END IF;

    IF v_current_balance < v_critical_threshold AND (v_current_balance + v_total_deduction) >= v_critical_threshold THEN
        v_critical_triggered := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'already_deducted', FALSE,
        'organization_id', p_organization_id,
        'meta_message_id', p_meta_message_id,
        'ledger_id', v_ledger_id,
        'deducted_paise', v_total_deduction,
        'units_billed', v_qty,
        'unit_rate_paise', v_unit_rate_paise,
        'balance_paise', v_current_balance,
        'new_balance_paise', v_current_balance,
        'warning_triggered', v_warning_triggered,
        'critical_triggered', v_critical_triggered
    );
END;
$$;

REVOKE ALL ON FUNCTION billing.record_and_deduct(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.record_and_deduct(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION billing.record_and_deduct(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION billing.record_and_deduct(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;
