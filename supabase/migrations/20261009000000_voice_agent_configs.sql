-- ==============================================================================
-- VOICE AI SELF-SERVE AGENT CONFIGURATION SCHEMA
-- Enables each customer/clinic to configure, customize, and manage their Voice AI
-- ==============================================================================

CREATE TABLE IF NOT EXISTS voice_agent_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    clinic_name TEXT NOT NULL,
    virtual_number TEXT,
    receptionist_phone TEXT NOT NULL,
    bot_name TEXT NOT NULL DEFAULT 'Maya',
    agent_persona TEXT NOT NULL DEFAULT 'receptionist' CHECK (agent_persona IN ('receptionist', 'triage', 'sales', 'reminder')),
    voice_id TEXT NOT NULL DEFAULT 'sonic-english-indian-1',
    greeting_message TEXT,
    primary_language TEXT NOT NULL DEFAULT 'en-IN',
    auto_language_switch BOOLEAN NOT NULL DEFAULT true,
    enabled_languages TEXT[] NOT NULL DEFAULT ARRAY['en-IN', 'hi-IN', 'kn-IN', 'ta-IN', 'te-IN'],
    operating_hours JSONB NOT NULL DEFAULT '{"mon_sat": "09:00-19:00", "sunday": "closed"}'::jsonb,
    emergency_instructions TEXT DEFAULT 'In case of severe emergency, please call 108 or proceed to the nearest emergency room immediately.',
    sms_confirmation_enabled BOOLEAN NOT NULL DEFAULT true,
    whatsapp_confirmation_enabled BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    onboarding_completed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for rapid lookup by DID and Organization
CREATE INDEX IF NOT EXISTS idx_voice_agent_configs_org_id ON voice_agent_configs(org_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_configs_did ON voice_agent_configs(virtual_number);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_voice_agent_configs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voice_agent_configs_updated_at ON voice_agent_configs;
CREATE TRIGGER trg_voice_agent_configs_updated_at
    BEFORE UPDATE ON voice_agent_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_voice_agent_configs_timestamp();

-- Enable Row Level Security (RLS)
ALTER TABLE voice_agent_configs ENABLE ROW LEVEL SECURITY;

-- 1. Full access for service_role (used by Python Voice AI Microservice)
CREATE POLICY "Service role full access on voice_agent_configs"
    ON voice_agent_configs
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- 2. Organization members can view their configuration
CREATE POLICY "Tenants view own voice_agent_configs"
    ON voice_agent_configs
    FOR SELECT
    USING (
        org_id IN (
            SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
        )
    );

-- 3. Organization members can insert their configuration
CREATE POLICY "Tenants insert own voice_agent_configs"
    ON voice_agent_configs
    FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
        )
    );

-- 4. Organization members can update their configuration
CREATE POLICY "Tenants update own voice_agent_configs"
    ON voice_agent_configs
    FOR UPDATE
    USING (
        org_id IN (
            SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        org_id IN (
            SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
        )
    );
