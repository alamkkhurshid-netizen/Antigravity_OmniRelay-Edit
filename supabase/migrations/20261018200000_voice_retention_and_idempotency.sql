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

-- Atomic Nonce Consumption Function
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

-- 2. Voice Call Logs Retention & Consent Enhancements
ALTER TABLE public.voice_call_logs 
    ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    ADD COLUMN IF NOT EXISTS retention_status TEXT DEFAULT 'active' CHECK (retention_status IN ('active', 'expired', 'purged', 'anonymized')),
    ADD COLUMN IF NOT EXISTS is_consented_recording BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS transcript_accessed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transcript_accessed_by UUID;

CREATE INDEX IF NOT EXISTS idx_voice_call_logs_retention 
    ON public.voice_call_logs(retention_expires_at) 
    WHERE retention_status = 'active';

-- Automated Expiration & Purge Stored Procedure
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

    RETURN v_purged_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_voice_recordings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_voice_recordings() TO service_role;

-- 3. Database-Level Booking Idempotency Index
-- Ensures identical voice session booking requests cannot create duplicate appointments
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_voice_call_idempotency
    ON public.appointments(organization_id, (metadata->>'voice_call_sid'))
    WHERE metadata->>'voice_call_sid' IS NOT NULL;
