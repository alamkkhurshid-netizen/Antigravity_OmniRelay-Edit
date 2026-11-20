CREATE TABLE IF NOT EXISTS public.voice_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_phone TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'inbound',
    agent_type TEXT NOT NULL DEFAULT 'receptionist',
    vertical TEXT NOT NULL DEFAULT 'clinic',
    duration_seconds INTEGER DEFAULT 0,
    cost_inr NUMERIC(10, 2) DEFAULT 0.00,
    outcome TEXT,
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

CREATE INDEX IF NOT EXISTS idx_voice_call_logs_org_id ON public.voice_call_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_voice_call_logs_created_at ON public.voice_call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_call_logs_call_sid ON public.voice_call_logs(exotel_call_sid);
CREATE INDEX IF NOT EXISTS idx_voice_call_logs_phone ON public.voice_call_logs(contact_phone);

CREATE TABLE IF NOT EXISTS public.voice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_sid TEXT UNIQUE NOT NULL,
    stream_sid TEXT,
    caller_phone TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_call_sid ON public.voice_sessions(call_sid);

ALTER TABLE public.voice_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'voice_call_logs' AND policyname = 'Service role full access on voice_call_logs'
    ) THEN
        CREATE POLICY "Service role full access on voice_call_logs"
            ON public.voice_call_logs
            FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role')
            WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'voice_call_logs' AND policyname = 'Tenants view own voice_call_logs'
    ) THEN
        CREATE POLICY "Tenants view own voice_call_logs"
            ON public.voice_call_logs
            FOR SELECT
            USING (
                org_id IN (
                    SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'voice_sessions' AND policyname = 'Service role full access on voice_sessions'
    ) THEN
        CREATE POLICY "Service role full access on voice_sessions"
            ON public.voice_sessions
            FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role')
            WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;

GRANT ALL ON public.voice_call_logs TO postgres, service_role;
GRANT SELECT ON public.voice_call_logs TO authenticated;
GRANT ALL ON public.voice_sessions TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
