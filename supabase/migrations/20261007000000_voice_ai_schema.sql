-- ============================================================
-- VOICE AI TELEPHONY & CALL LOGS SCHEMA (Phase 2)
-- Enables telemetry, audit trails, and isolated views for Voice AI
-- ============================================================

-- 1. Voice Call Logs
CREATE TABLE IF NOT EXISTS voice_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    contact_phone TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    agent_type TEXT NOT NULL DEFAULT 'receptionist' CHECK (agent_type IN ('receptionist', 'sales', 'reminder', 'triage')),
    vertical TEXT NOT NULL DEFAULT 'clinic' CHECK (vertical IN ('clinic', 'restaurant', 'retail', 'general')),
    duration_seconds INTEGER DEFAULT 0,
    outcome TEXT CHECK (outcome IN (
        'appointment_booked',
        'inquiry_resolved',
        'human_transferred',
        'emergency_escalated',
        'caller_hung_up',
        'voicemail',
        'failed'
    )),
    exotel_call_sid TEXT,
    stream_sid TEXT,
    transcript JSONB DEFAULT '[]'::jsonb,
    summary TEXT,
    emergency_flag BOOLEAN DEFAULT FALSE,
    emergency_reason TEXT,
    latency_metrics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for rapid lookup
CREATE INDEX IF NOT EXISTS idx_voice_call_logs_org_id ON voice_call_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_voice_call_logs_created_at ON voice_call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_call_logs_call_sid ON voice_call_logs(exotel_call_sid);
CREATE INDEX IF NOT EXISTS idx_voice_call_logs_phone ON voice_call_logs(contact_phone);

-- 2. Voice Sessions (Active Streaming State)
CREATE TABLE IF NOT EXISTS voice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_sid TEXT UNIQUE NOT NULL,
    stream_sid TEXT,
    caller_phone TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dropped', 'error')),
    metadata JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_call_sid ON voice_sessions(call_sid);

-- 3. Read-Only Production Views for Python Microservice
-- Allows voice agent to query availability safely without direct table mutation access
CREATE OR REPLACE VIEW voice_appointments_readonly AS
SELECT 
    a.id,
    a.organization_id,
    a.customer_name AS patient_name,
    a.customer_phone AS patient_phone,
    (a.starts_at AT TIME ZONE 'Asia/Kolkata')::date AS appointment_date,
    to_char(a.starts_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS start_time,
    to_char(a.ends_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS end_time,
    a.starts_at,
    a.ends_at,
    a.status,
    a.resource_id AS doctor_id,
    r.name AS doctor_name,
    a.service_id,
    s.name AS service_name,
    a.location_id
FROM appointments a
LEFT JOIN booking_resources r ON a.resource_id = r.id
LEFT JOIN organization_services s ON a.service_id = s.id
WHERE a.status IN ('confirmed', 'pending', 'arrived');

CREATE OR REPLACE VIEW voice_org_config_readonly AS
SELECT 
    id,
    name,
    phone,
    address,
    operating_hours,
    emergency_phone,
    is_active
FROM organizations
WHERE is_active = true;

-- 4. Enable Row Level Security (RLS) on voice_call_logs
ALTER TABLE voice_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on voice_call_logs"
    ON voice_call_logs
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Allow authenticated tenants to view only their own call logs
CREATE POLICY "Tenants view own voice_call_logs"
    ON voice_call_logs
    FOR SELECT
    USING (
        org_id IN (
            SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
        )
    );
