-- Phase 1: Database & Governance Foundation for "Super CTO" Model

-- Create Enums for strict type safety
CREATE TYPE ai_patch_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE ai_risk_level AS ENUM ('low', 'medium', 'high');

-- Create the holding cell table
CREATE TABLE IF NOT EXISTS public.ai_governance_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- The Observer Data (What broke?)
    source_error JSONB NOT NULL,
    
    -- The Builder Data (Gemini's Fix)
    diagnosis TEXT NOT NULL,
    proposed_patch TEXT NOT NULL,
    affected_files JSONB NOT NULL,
    risk_level ai_risk_level NOT NULL DEFAULT 'medium',
    
    -- The Governor Data (Human-in-the-loop)
    status ai_patch_status NOT NULL DEFAULT 'pending',
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.ai_governance_queue ENABLE ROW LEVEL SECURITY;

-- Secure Zero-Trust Governance:
-- We intentionally DO NOT create any public or authenticated RLS policies for INSERT or UPDATE.
-- This ensures that NO frontend client can ever tamper with the AI queue.
-- Only our secure Next.js Backend (The Observer API) and the WhatsApp Webhook (The Governor API) 
-- will be able to write and update this table using the SUPABASE_SERVICE_ROLE_KEY.
CREATE POLICY "Admins can view the queue for dashboard monitoring"
ON public.ai_governance_queue
FOR SELECT
USING (auth.role() = 'authenticated');

-- Trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_ai_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_governance_queue_updated_at
BEFORE UPDATE ON public.ai_governance_queue
FOR EACH ROW EXECUTE FUNCTION update_ai_queue_updated_at();
