-- ==============================================================================
-- OMNIRELAY BILLING & TENANT WALLET SYSTEM (Post-Meta-Approval Production Schema)
-- Conforms to Omnirelay_CTO_Action_Plan.md and OMNIRELAY_PRICING_AND_PACKAGING
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS billing;

-- 1. TENANT OPERATIONAL WALLETS
CREATE TABLE IF NOT EXISTS billing.tenant_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
    balance_paise BIGINT NOT NULL DEFAULT 0,
    warning_threshold_paise BIGINT NOT NULL DEFAULT 50000,   -- ₹500
    critical_threshold_paise BIGINT NOT NULL DEFAULT 20000,  -- ₹200
    currency TEXT NOT NULL DEFAULT 'INR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_wallets_org ON billing.tenant_wallets(organization_id);

-- 2. WALLET TRANSACTIONS (Top-ups, Deductions, Refunds)
CREATE TABLE IF NOT EXISTS billing.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('top_up', 'deduction', 'refund', 'adjustment')),
    razorpay_payment_id TEXT UNIQUE,
    razorpay_order_id TEXT,
    razorpay_signature TEXT,
    gst_amount_paise BIGINT DEFAULT 0,
    invoice_number TEXT,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_org_time ON billing.wallet_transactions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_rzp ON billing.wallet_transactions(razorpay_payment_id);

-- 3. META RATE CARD (Versioned base rates for official Meta and Telecom pricing)
CREATE TABLE IF NOT EXISTS billing.meta_rate_card (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'voice', 'sms')),
    country_code TEXT NOT NULL DEFAULT 'IN',
    category TEXT NOT NULL CHECK (category IN ('utility', 'marketing', 'authentication', 'service', 'voice')),
    base_rate_paise BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    effective_date TIMESTAMPTZ NOT NULL DEFAULT '2026-10-01 00:00:00+00',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_meta_rate 
ON billing.meta_rate_card (channel, country_code, category) 
WHERE active = TRUE;

-- Seed Official Oct 1, 2026 Rates for India (Values in Paise)
INSERT INTO billing.meta_rate_card (channel, country_code, category, base_rate_paise, effective_date, active)
VALUES 
    ('whatsapp', 'IN', 'utility', 12, '2026-10-01 00:00:00+00', TRUE),        -- ₹0.12 base
    ('whatsapp', 'IN', 'authentication', 12, '2026-10-01 00:00:00+00', TRUE), -- ₹0.12 base
    ('whatsapp', 'IN', 'marketing', 78, '2026-10-01 00:00:00+00', TRUE),     -- ₹0.78 base
    ('whatsapp', 'IN', 'service', 29, '2026-10-01 00:00:00+00', TRUE),       -- ₹0.29 base (effective Oct 1, 2026)
    ('voice', 'IN', 'voice', 250, '2026-10-01 00:00:00+00', TRUE)            -- ₹2.50 / min base telecom + AI
ON CONFLICT DO NOTHING;

-- 4. TENANT PRICING TIERS & MARGIN RULES
CREATE TABLE IF NOT EXISTS billing.tenant_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
    tier_name TEXT NOT NULL DEFAULT 'Starter' CHECK (tier_name IN ('Starter', 'Growth', 'Scale', 'Enterprise')),
    markup_percentage NUMERIC(5, 2) NOT NULL DEFAULT 25.00,
    monthly_spend_paise BIGINT NOT NULL DEFAULT 0,
    effective_month TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_pricing_tiers_org ON billing.tenant_pricing_tiers(organization_id);

-- 5. AUDITABLE MESSAGE LEDGER (Per-message deduction records)
CREATE TABLE IF NOT EXISTS billing.message_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    meta_message_id TEXT UNIQUE NOT NULL,
    channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'voice', 'sms')),
    category TEXT NOT NULL CHECK (category IN ('utility', 'marketing', 'authentication', 'service', 'voice')),
    base_cost_paise BIGINT NOT NULL,
    platform_markup_paise BIGINT NOT NULL,
    total_deducted_paise BIGINT NOT NULL,
    balance_after_paise BIGINT,
    delivery_status TEXT NOT NULL DEFAULT 'delivered' CHECK (delivery_status IN ('sent', 'delivered', 'read', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_ledger_org_time ON billing.message_ledger(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_ledger_meta_id ON billing.message_ledger(meta_message_id);

-- 6. MONTHLY RECONCILIATION
CREATE TABLE IF NOT EXISTS billing.billing_reconciliation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    meta_invoice_paise BIGINT NOT NULL DEFAULT 0,
    ledger_sum_paise BIGINT NOT NULL DEFAULT 0,
    variance_paise BIGINT NOT NULL DEFAULT 0,
    variance_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reconciled', 'flagged', 'approved')),
    discrepancy_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- ATOMIC STORED PROCEDURES (Concurrency Locks & Idempotency)
-- ==============================================================================

-- 1. Idempotent Top-Up (Called on Razorpay Webhook)
CREATE OR REPLACE FUNCTION billing.credit_wallet(
    p_organization_id UUID,
    p_amount_paise BIGINT,
    p_razorpay_payment_id TEXT,
    p_razorpay_order_id TEXT DEFAULT NULL,
    p_gst_paise BIGINT DEFAULT 0,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_wallet_record RECORD;
    v_new_balance BIGINT;
    v_tx_id UUID;
BEGIN
    -- Idempotency check: if razorpay_payment_id already exists, return current balance
    IF EXISTS (
        SELECT 1 FROM billing.wallet_transactions 
        WHERE razorpay_payment_id = p_razorpay_payment_id
    ) THEN
        SELECT balance_paise INTO v_new_balance 
        FROM billing.tenant_wallets 
        WHERE organization_id = p_organization_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'already_processed', TRUE,
            'organization_id', p_organization_id,
            'balance_paise', COALESCE(v_new_balance, 0)
        );
    END IF;

    -- Upsert tenant wallet with row-level lock
    INSERT INTO billing.tenant_wallets (organization_id, balance_paise)
    VALUES (p_organization_id, 0)
    ON CONFLICT (organization_id) DO NOTHING;

    SELECT balance_paise INTO v_new_balance
    FROM billing.tenant_wallets
    WHERE organization_id = p_organization_id
    FOR UPDATE;

    v_new_balance := v_new_balance + p_amount_paise;

    -- Update balance
    UPDATE billing.tenant_wallets
    SET 
        balance_paise = v_new_balance,
        updated_at = NOW()
    WHERE organization_id = p_organization_id;

    -- Insert audit transaction
    INSERT INTO billing.wallet_transactions (
        organization_id,
        amount_paise,
        transaction_type,
        razorpay_payment_id,
        razorpay_order_id,
        gst_amount_paise,
        metadata
    )
    VALUES (
        p_organization_id,
        p_amount_paise,
        'top_up',
        p_razorpay_payment_id,
        p_razorpay_order_id,
        p_gst_paise,
        p_metadata
    )
    RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'already_processed', FALSE,
        'transaction_id', v_tx_id,
        'organization_id', p_organization_id,
        'amount_credited_paise', p_amount_paise,
        'balance_paise', v_new_balance
    );
END;
$$;

-- 2. Block-Before-Send Check (Called before Meta Graph API / Voice Call dispatches)
CREATE OR REPLACE FUNCTION billing.can_send_message(
    p_organization_id UUID,
    p_category TEXT,
    p_channel TEXT DEFAULT 'whatsapp',
    p_country_code TEXT DEFAULT 'IN'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_balance BIGINT := 0;
    v_base_rate BIGINT := 12;
    v_markup_pct NUMERIC := 25.00;
    v_estimated_cost BIGINT;
    v_allowed BOOLEAN := FALSE;
    v_buffer_used BOOLEAN := FALSE;
    v_reason TEXT := 'OK';
BEGIN
    -- 1. Fetch current wallet balance
    SELECT balance_paise INTO v_balance
    FROM billing.tenant_wallets
    WHERE organization_id = p_organization_id;

    IF v_balance IS NULL THEN
        v_balance := 0;
    END IF;

    -- 2. Fetch active rate card
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

    -- 3. Fetch tenant markup percentage
    SELECT markup_percentage INTO v_markup_pct
    FROM billing.tenant_pricing_tiers
    WHERE organization_id = p_organization_id;

    IF v_markup_pct IS NULL THEN
        IF p_category = 'marketing' THEN v_markup_pct := 22.00;
        ELSE v_markup_pct := 25.00;
        END IF;
    END IF;

    v_estimated_cost := v_base_rate + ROUND(v_base_rate * (v_markup_pct / 100.00))::BIGINT;

    -- 4. Policy enforcement
    IF p_category = 'marketing' THEN
        -- Marketing: Strict zero-tolerance block if balance < cost
        IF v_balance >= v_estimated_cost THEN
            v_allowed := TRUE;
        ELSE
            v_allowed := FALSE;
            v_reason := 'INSUFFICIENT_FUNDS_MARKETING_BLOCKED';
        END IF;
    ELSE
        -- Utility / Auth / Service / Voice Reminders:
        -- Negative buffer of -₹50 (-5000 paise) to protect customer trust for booking/reminders
        IF v_balance >= v_estimated_cost THEN
            v_allowed := TRUE;
        ELSIF v_balance >= (-5000 + v_estimated_cost) THEN
            v_allowed := TRUE;
            v_buffer_used := TRUE;
            v_reason := 'NEGATIVE_BUFFER_ACTIVE';
        ELSE
            v_allowed := FALSE;
            v_reason := 'CRITICAL_BUFFER_EXCEEDED_SEND_BLOCKED';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'organization_id', p_organization_id,
        'category', p_category,
        'current_balance_paise', v_balance,
        'estimated_cost_paise', v_estimated_cost,
        'buffer_used', v_buffer_used,
        'reason', v_reason
    );
END;
$$;

-- 3. Atomic Deduction with Row-Level Lock (Called on Meta Delivery Webhook or Voice Call End)
CREATE OR REPLACE FUNCTION billing.record_and_deduct(
    p_organization_id UUID,
    p_meta_message_id TEXT,
    p_category TEXT,
    p_channel TEXT DEFAULT 'whatsapp',
    p_country_code TEXT DEFAULT 'IN'
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

    v_markup_paise := ROUND(v_base_rate * (v_markup_pct / 100.00))::BIGINT;
    v_total_deduction := v_base_rate + v_markup_paise;

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

    -- 6. Insert into message ledger
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
        v_base_rate,
        v_markup_paise,
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
        'deducted_paise', v_total_deduction,
        'new_balance_paise', v_current_balance,
        'warning_triggered', v_warning_triggered,
        'critical_triggered', v_critical_triggered
    );
END;
$$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE billing.tenant_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.meta_rate_card ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.tenant_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.message_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.billing_reconciliation ENABLE ROW LEVEL SECURITY;

-- Revoke all mutations by default from unprivileged roles
REVOKE ALL ON billing.tenant_wallets, billing.wallet_transactions, billing.meta_rate_card, 
               billing.tenant_pricing_tiers, billing.message_ledger, billing.billing_reconciliation 
FROM public, anon;

GRANT SELECT ON billing.tenant_wallets, billing.wallet_transactions, billing.meta_rate_card, 
                billing.tenant_pricing_tiers, billing.message_ledger 
TO authenticated;

-- Service role has full permissions for automated processing
GRANT ALL ON ALL TABLES IN SCHEMA billing TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA billing TO service_role;

-- Tenants can only view their own wallet, transactions, and ledger
CREATE POLICY "tenants view own wallet" ON billing.tenant_wallets
FOR SELECT TO authenticated
USING (private.is_organization_member(organization_id, 'member'));

CREATE POLICY "tenants view own transactions" ON billing.wallet_transactions
FOR SELECT TO authenticated
USING (private.is_organization_member(organization_id, 'member'));

CREATE POLICY "tenants view own message ledger" ON billing.message_ledger
FOR SELECT TO authenticated
USING (private.is_organization_member(organization_id, 'member'));

CREATE POLICY "tenants view own pricing tier" ON billing.tenant_pricing_tiers
FOR SELECT TO authenticated
USING (private.is_organization_member(organization_id, 'member'));

CREATE POLICY "authenticated users read active rate card" ON billing.meta_rate_card
FOR SELECT TO authenticated
USING (active = TRUE);
