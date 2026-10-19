-- ==============================================================================
-- DURABLE WHATSAPP INBOUND LIFECYCLE & DEDUPLICATION
-- Lifecycle: received -> queued -> processing -> completed / failed
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider_message_id TEXT NOT NULL UNIQUE,
    recipient_phone_id TEXT NOT NULL,
    sender_phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'queued', 'processing', 'completed', 'failed')),
    message_type TEXT NOT NULL DEFAULT 'text',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_inbound_org_status ON public.whatsapp_inbound_messages (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_inbound_provider_msg ON public.whatsapp_inbound_messages (provider_message_id);

ALTER TABLE public.whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read workspace inbound messages"
    ON public.whatsapp_inbound_messages
    FOR SELECT TO authenticated
    USING (
        organization_id IS NOT NULL AND
        private.is_organization_member(organization_id, 'admin')
    );

GRANT SELECT ON public.whatsapp_inbound_messages TO authenticated;
GRANT ALL ON public.whatsapp_inbound_messages TO service_role;
