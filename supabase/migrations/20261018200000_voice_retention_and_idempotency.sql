-- ==============================================================================
-- VOICE AI TELEPHONY: DURABLE NONCES, RETENTION GOVERNANCE & BOOKING IDEMPOTENCY
-- Migration: 20261018200000_voice_retention_and_idempotency.sql
-- ==============================================================================

-- 1. Voice Service Request Nonces Table (Atomic Replay Attack Prevention)
CREATE TABLE IF NOT EXISTS public.voice_service_nonces (
    request_id TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_nonces_org_expires 
    ON public.voice_service_nonces(organization_id, expires_at);

ALTER TABLE public.voice_service_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.voice_service_nonces FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.voice_service_nonces TO service_role;

-- Atomic Nonce Consumption Function (Fail-Closed)
CREATE OR REPLACE FUNCTION public.consume_voice_request_nonce(
    p_request_id TEXT,
    p_org_id UUID,
    p_expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.voice_service_nonces (request_id, organization_id, expires_at, consumed_at)
    VALUES (p_request_id, p_org_id, p_expires_at, NOW());
    RETURN TRUE;
EXCEPTION WHEN unique_violation THEN
    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_voice_request_nonce(TEXT, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_voice_request_nonce(TEXT, UUID, TIMESTAMPTZ) TO service_role;

-- 2. Durable API Rate Limits Table (Multi-Instance / PostgreSQL Rate Limiting)
CREATE TABLE IF NOT EXISTS public.durable_api_rate_limits (
    key TEXT PRIMARY KEY,
    hits INT NOT NULL DEFAULT 1,
    window_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_durable_rate_limits_expires 
    ON public.durable_api_rate_limits(window_expires_at);

ALTER TABLE public.durable_api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.durable_api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.durable_api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_durable_rate_limit(
    p_key TEXT,
    p_limit INT,
    p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_expires TIMESTAMPTZ := v_now + (p_window_seconds || ' seconds')::INTERVAL;
    v_hits INT;
BEGIN
    INSERT INTO public.durable_api_rate_limits (key, hits, window_expires_at)
    VALUES (p_key, 1, v_expires)
    ON CONFLICT (key) DO UPDATE
    SET 
        hits = CASE 
            WHEN public.durable_api_rate_limits.window_expires_at <= v_now THEN 1
            ELSE public.durable_api_rate_limits.hits + 1
        END,
        window_expires_at = CASE 
            WHEN public.durable_api_rate_limits.window_expires_at <= v_now THEN v_expires
            ELSE public.durable_api_rate_limits.window_expires_at
        END
    RETURNING hits INTO v_hits;

    RETURN v_hits <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_durable_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_durable_rate_limit(TEXT, INT, INT) TO service_role;

-- 3. Voice Call Logs Retention & Consent Enhancements
ALTER TABLE public.voice_call_logs 
    ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    ADD COLUMN IF NOT EXISTS retention_status TEXT DEFAULT 'active' CHECK (retention_status IN ('active', 'expired', 'purged', 'anonymized')),
    ADD COLUMN IF NOT EXISTS is_consented_recording BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS transcript_accessed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transcript_accessed_by UUID;

CREATE INDEX IF NOT EXISTS idx_voice_call_logs_retention 
    ON public.voice_call_logs(retention_expires_at) 
    WHERE retention_status = 'active';

-- 4. Append-Only Transcript Access Audit Table (Compliance Requirement)
CREATE TABLE IF NOT EXISTS public.voice_transcript_access_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_log_id UUID NOT NULL REFERENCES public.voice_call_logs(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    accessed_by UUID NOT NULL,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcript_access_audits_call_log 
    ON public.voice_transcript_access_audits(call_log_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcript_access_audits_org 
    ON public.voice_transcript_access_audits(organization_id, accessed_at DESC);

ALTER TABLE public.voice_transcript_access_audits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.voice_transcript_access_audits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.voice_transcript_access_audits TO service_role;

-- 5. Automated Expiration & Purge Stored Procedure
CREATE OR REPLACE FUNCTION public.purge_expired_voice_recordings()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_purged_count INT;
BEGIN
    -- Purge transcripts and summaries where retention window has lapsed
    UPDATE public.voice_call_logs
    SET 
        transcript = '[{"speaker":"system","text":"[TRANSCRIPT_PURGED: 30-day retention window expired]"}]'::jsonb,
        summary = '[SUMMARY_PURGED_RETENTION_EXPIRED]',
        retention_status = 'purged',
        updated_at = NOW()
    WHERE retention_expires_at < NOW()
      AND retention_status = 'active';

    GET DIAGNOSTICS v_purged_count = ROW_COUNT;

    -- Also clean up expired request nonces older than 24 hours
    DELETE FROM public.voice_service_nonces
    WHERE expires_at < (NOW() - INTERVAL '24 hours');

    -- Clean up expired durable rate limit entries older than 1 hour
    DELETE FROM public.durable_api_rate_limits
    WHERE window_expires_at < (NOW() - INTERVAL '1 hour');

    RETURN v_purged_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_voice_recordings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_voice_recordings() TO service_role;

-- 6. Database-Level Booking Idempotency Index
-- Ensures identical voice session booking requests cannot create duplicate appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Allow 'voice' and 'Voice' appointment sources for voice booking integration
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_source_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_source_check 
    CHECK (source = ANY (ARRAY['dashboard'::text, 'whatsapp'::text, 'instagram'::text, 'web'::text, 'import'::text, 'voice'::text, 'Voice'::text]));

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_voice_call_idempotency
    ON public.appointments(organization_id, (metadata->>'voice_call_sid'))
    WHERE metadata->>'voice_call_sid' IS NOT NULL;


