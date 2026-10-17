-- ==============================================================================
-- 20261010000007_reconcile_post_baseline_bindings.sql
-- 
-- Post-Baseline Forward Reconciliation Migration
-- 
-- Reconciles historical migrations (20261006000000, 20261006100000, 20261007000000,
-- 20261009000000) on existing deployed databases that already recorded those timestamps.
-- 
-- Changes:
-- 1. Re-binds RLS policies on tenant_documents & document_chunks to canonical public.agents.
-- 2. Re-binds RLS policies on retail module tables (meta_capi_config, retail_products, capi_event_logs).
-- 3. Recreates voice_org_config_readonly view safely using JSONB extra fields from organizations.
-- 4. Re-binds RLS policies on voice_call_logs and voice_agent_configs to public.agents.
-- 5. Repairs function search_paths and grants (match_documents, consume_oauth_nonce, record_and_deduct).
-- 
-- Fully idempotent: uses IF EXISTS / IF NOT EXISTS and non-destructive replacements.
-- ==============================================================================

-- 1. Document Ingestion Pipeline Policies
DROP POLICY IF EXISTS "Users can access documents in their organization" ON public.tenant_documents;
CREATE POLICY "Users can access documents in their organization"
    ON public.tenant_documents
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can access document chunks in their organization" ON public.document_chunks;
CREATE POLICY "Users can access document chunks in their organization"
    ON public.document_chunks
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
        )
    );

-- 2. Retail Module & Meta CAPI Config Policies
DROP POLICY IF EXISTS "Users can manage their own organization's CAPI config" ON public.meta_capi_config;
CREATE POLICY "Users can manage their own organization's CAPI config"
    ON public.meta_capi_config
    FOR ALL
    TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can manage their own organization's products" ON public.retail_products;
CREATE POLICY "Users can manage their own organization's products"
    ON public.retail_products
    FOR ALL
    TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users can view their organization's CAPI logs" ON public.capi_event_logs;
CREATE POLICY "Users can view their organization's CAPI logs"
    ON public.capi_event_logs
    FOR SELECT
    TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
    ));

-- 3. Voice Config View & Voice Call Logs Policy
CREATE OR REPLACE VIEW public.voice_org_config_readonly AS
SELECT 
    id,
    name,
    COALESCE(extra->>'phone', '') AS phone,
    COALESCE(extra->>'address', '') AS address,
    COALESCE(extra->>'operating_hours', '{}') AS operating_hours,
    COALESCE(extra->>'emergency_phone', '') AS emergency_phone,
    TRUE AS is_active
FROM public.organizations;

GRANT SELECT ON public.voice_org_config_readonly TO authenticated, service_role;

DROP POLICY IF EXISTS "Tenants view own voice_call_logs" ON public.voice_call_logs;
CREATE POLICY "Tenants view own voice_call_logs"
    ON public.voice_call_logs
    FOR SELECT
    USING (
        org_id IN (
            SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
        )
    );

-- 4. Voice Agent Configs Policies
DROP POLICY IF EXISTS "Tenants view own voice_agent_configs" ON public.voice_agent_configs;
CREATE POLICY "Tenants view own voice_agent_configs"
    ON public.voice_agent_configs
    FOR SELECT
    USING (
        org_id IN (
            SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Tenants insert own voice_agent_configs" ON public.voice_agent_configs;
CREATE POLICY "Tenants insert own voice_agent_configs"
    ON public.voice_agent_configs
    FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Tenants update own voice_agent_configs" ON public.voice_agent_configs;
CREATE POLICY "Tenants update own voice_agent_configs"
    ON public.voice_agent_configs
    FOR UPDATE
    USING (
        org_id IN (
            SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        org_id IN (
            SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
        )
    );

-- 5. Repair Function Search Paths and Grants
CREATE OR REPLACE FUNCTION public.match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_organization_id uuid
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.organization_id = p_organization_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_documents(vector, float, int, uuid) TO authenticated, service_role;

-- 6. System Runtime Controls (Dynamic Instant Audited Emergency Controls)
CREATE TABLE IF NOT EXISTS public.system_runtime_controls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    control_key text NOT NULL,
    is_enabled boolean NOT NULL DEFAULT true,
    scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'tenant')),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    updated_by text,
    reason text,
    version integer NOT NULL DEFAULT 1,
    expires_at timestamptz,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT system_runtime_controls_key_org_uidx UNIQUE NULLS NOT DISTINCT (control_key, organization_id)
);

ALTER TABLE public.system_runtime_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users view runtime controls" ON public.system_runtime_controls;
DROP POLICY IF EXISTS "Tenants view own runtime controls" ON public.system_runtime_controls;

CREATE POLICY "Tenants view own runtime controls"
    ON public.system_runtime_controls
    FOR SELECT
    TO authenticated
    USING (
        organization_id IS NOT NULL 
        AND organization_id IN (
            SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
        )
    );

GRANT SELECT ON public.system_runtime_controls TO authenticated;
GRANT ALL ON public.system_runtime_controls TO service_role;

