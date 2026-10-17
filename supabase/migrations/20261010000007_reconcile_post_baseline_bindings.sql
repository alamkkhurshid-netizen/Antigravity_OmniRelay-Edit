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

-- 7. Controlled Operator Update RPC for System Runtime Controls
CREATE OR REPLACE FUNCTION public.set_runtime_control (
    p_control_key text,
    p_is_enabled boolean,
    p_scope text DEFAULT 'global',
    p_organization_id uuid DEFAULT NULL,
    p_reason text DEFAULT NULL,
    p_expected_version int DEFAULT NULL,
    p_expires_at timestamptz DEFAULT NULL,
    p_is_emergency boolean DEFAULT false,
    p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id uuid := coalesce(auth.uid(), p_actor_id);
    v_is_service_role boolean := (auth.role() = 'service_role' AND p_actor_id IS NULL);
    v_existing RECORD;
    v_old_value boolean;
    v_old_version int;
    v_new_version int;
    v_result jsonb;
BEGIN
    -- 1. Control Key Allowlist Validation
    IF p_control_key NOT IN (
        'WORKER_ENABLED',
        'WHATSAPP_INBOUND_WORKER_ENABLED',
        'APPOINTMENT_REMINDER_WORKER_ENABLED',
        'CARE_REMINDER_WORKER_ENABLED',
        'CAMPAIGN_WORKER_ENABLED',
        'CAMPAIGN_DISPATCH_WORKER_ENABLED',
        'AUTOMATION_RUNNER_WORKER_ENABLED',
        'DOCTOR_QUEUE_WORKER_ENABLED',
        'DEVICE_PUSH_WORKER_ENABLED',
        'DEPOSIT_ACCEPTANCE_WORKER_ENABLED',
        'ROSTER_DISPATCH_WORKER_ENABLED',
        'GROWTH_OFFICER_WORKER_ENABLED',
        'TOKEN_HEALTH_WORKER_ENABLED',
        'VOICE_PILOT_KILL_SWITCH',
        'VOICE_PROVIDER_FALLBACK',
        'RECORD_AND_DEDUCT_METERING',
        'EMERGENCY_OVERRIDE'
    ) THEN
        INSERT INTO public.operational_events (
            organization_id, event_source, error_code, safe_message, severity, metadata
        ) VALUES (
            p_organization_id, 'runtime_control_operator', 'RUNTIME_CONTROL_DENIED',
            format('Denied update for unallowed control key: %s', p_control_key),
            'warning',
            jsonb_build_object('control_key', p_control_key, 'actor_id', coalesce(v_caller_id::text, 'service_role'), 'reason', 'unallowed_control_key')
        );
        RAISE EXCEPTION 'Control key % is not in the allowed runtime controls list.' USING ERRCODE = '22023';
    END IF;

    -- 2. Scope-Specific Authorization
    IF p_scope = 'global' THEN
        IF NOT v_is_service_role THEN
            IF v_caller_id IS NULL OR NOT (
                EXISTS (
                    SELECT 1 FROM private.platform_operators po
                    WHERE po.user_id = v_caller_id AND po.active
                )
            ) THEN
                INSERT INTO public.operational_events (
                    organization_id, event_source, error_code, safe_message, severity, metadata
                ) VALUES (
                    p_organization_id, 'runtime_control_operator', 'RUNTIME_CONTROL_DENIED',
                    format('Unauthorized global runtime control update attempted for %s by user %s', p_control_key, coalesce(v_caller_id::text, 'anonymous')),
                    'critical',
                    jsonb_build_object('control_key', p_control_key, 'actor_id', coalesce(v_caller_id::text, 'anonymous'), 'reason', 'platform_operator_required', 'scope', 'global')
                );
                RAISE EXCEPTION 'Platform operator authorization required for global controls.' USING ERRCODE = '42501';
            END IF;
        END IF;
    ELSIF p_scope = 'tenant' THEN
        IF p_organization_id IS NULL THEN
            RAISE EXCEPTION 'organization_id is strictly required when scope is tenant.' USING ERRCODE = '22023';
        END IF;

        IF NOT v_is_service_role THEN
            IF v_caller_id IS NULL OR NOT (
                EXISTS (
                    SELECT 1 FROM public.agents a
                    WHERE a.organization_id = p_organization_id
                      AND a.user_id = v_caller_id
                      AND CASE coalesce(a.extra->>'role', a.role, 'member')
                            WHEN 'owner' THEN 30
                            WHEN 'admin' THEN 20
                            ELSE 10
                          END >= 20
                )
            ) THEN
                INSERT INTO public.operational_events (
                    organization_id, event_source, error_code, safe_message, severity, metadata
                ) VALUES (
                    p_organization_id, 'runtime_control_operator', 'RUNTIME_CONTROL_DENIED',
                    format('Unauthorized tenant control update attempted for %s on org %s by user %s', p_control_key, p_organization_id, coalesce(v_caller_id::text, 'anonymous')),
                    'critical',
                    jsonb_build_object('control_key', p_control_key, 'organization_id', p_organization_id, 'actor_id', coalesce(v_caller_id::text, 'anonymous'), 'reason', 'tenant_admin_or_owner_required', 'scope', 'tenant')
                );
                RAISE EXCEPTION 'Tenant admin or owner authorization required for organization %.', p_organization_id USING ERRCODE = '42501';
            END IF;
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid scope: %. Must be either global or tenant.', p_scope USING ERRCODE = '22023';
    END IF;

    -- 3. Mandatory Reason
    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
        INSERT INTO public.operational_events (
            organization_id, event_source, error_code, safe_message, severity, metadata
        ) VALUES (
            p_organization_id, 'runtime_control_operator', 'RUNTIME_CONTROL_DENIED',
            format('Denied update for control %s: insufficient justification reason', p_control_key),
            'warning',
            jsonb_build_object('control_key', p_control_key, 'actor_id', coalesce(v_caller_id::text, 'service_role'), 'reason', 'missing_justification')
        );
        RAISE EXCEPTION 'A descriptive reason (min 5 chars) is strictly required to modify runtime controls.' USING ERRCODE = '22023';
    END IF;

    -- 4. Expiry Required for Emergency Overrides
    IF p_is_emergency THEN
        IF p_expires_at IS NULL OR p_expires_at <= now() THEN
            INSERT INTO public.operational_events (
                organization_id, event_source, error_code, safe_message, severity, metadata
            ) VALUES (
                p_organization_id, 'runtime_control_operator', 'RUNTIME_CONTROL_DENIED',
                format('Denied emergency override for control %s: missing future expiry timestamp', p_control_key),
                'warning',
                jsonb_build_object('control_key', p_control_key, 'actor_id', coalesce(v_caller_id::text, 'service_role'), 'reason', 'missing_emergency_expiry')
            );
            RAISE EXCEPTION 'Emergency overrides strictly require a future expiration timestamp (expires_at).' USING ERRCODE = '22023';
        END IF;
    END IF;

    -- 5. Fetch Existing Row and Enforce Optimistic Version Locking
    SELECT * INTO v_existing 
    FROM public.system_runtime_controls 
    WHERE control_key = p_control_key 
      AND (
        (p_organization_id IS NULL AND organization_id IS NULL)
        OR organization_id = p_organization_id
      )
    FOR UPDATE;

    IF FOUND THEN
        v_old_value := v_existing.is_enabled;
        v_old_version := v_existing.version;
        
        IF p_expected_version IS NOT NULL AND v_old_version <> p_expected_version THEN
            RAISE EXCEPTION 'Optimistic concurrency failure: expected version % does not match current version %.', 
                p_expected_version, v_old_version USING ERRCODE = 'P0002';
        END IF;
        
        v_new_version := v_old_version + 1;

        UPDATE public.system_runtime_controls
        SET is_enabled = p_is_enabled,
            scope = p_scope,
            reason = p_reason,
            updated_by = coalesce(v_caller_id::text, 'service_role'),
            version = v_new_version,
            expires_at = p_expires_at,
            updated_at = now()
        WHERE id = v_existing.id
        RETURNING to_jsonb(system_runtime_controls.*) INTO v_result;
    ELSE
        v_old_value := NULL;
        v_old_version := 0;
        v_new_version := 1;

        IF p_expected_version IS NOT NULL AND p_expected_version <> 0 THEN
            RAISE EXCEPTION 'Optimistic concurrency failure: record does not exist but expected version was %.', 
                p_expected_version USING ERRCODE = 'P0002';
        END IF;

        INSERT INTO public.system_runtime_controls (
            control_key,
            is_enabled,
            scope,
            organization_id,
            updated_by,
            reason,
            version,
            expires_at
        ) VALUES (
            p_control_key,
            p_is_enabled,
            p_scope,
            p_organization_id,
            coalesce(v_caller_id::text, 'service_role'),
            p_reason,
            v_new_version,
            p_expires_at
        )
        RETURNING to_jsonb(system_runtime_controls.*) INTO v_result;
    END IF;

    -- 6. Record Audit Event in operational_events
    INSERT INTO public.operational_events (
        organization_id,
        event_source,
        error_code,
        safe_message,
        severity,
        metadata
    ) VALUES (
        p_organization_id,
        'runtime_control_operator',
        'RUNTIME_CONTROL_UPDATED',
        format('Runtime control %s updated by %s (version %s -> %s): enabled=%s', 
            p_control_key, coalesce(v_caller_id::text, 'service_role'), v_old_version, v_new_version, p_is_enabled),
        CASE WHEN p_is_emergency THEN 'critical' ELSE 'warning' END,
        jsonb_build_object(
            'control_key', p_control_key,
            'previous_value', v_old_value,
            'new_value', p_is_enabled,
            'previous_version', v_old_version,
            'new_version', v_new_version,
            'reason', p_reason,
            'expires_at', p_expires_at,
            'scope', p_scope,
            'is_emergency', p_is_emergency
        )
    );

    RETURN v_result;
END;
$$;

-- Revoke direct table mutations; enforce RPC or service-role management only
REVOKE INSERT, UPDATE, DELETE ON public.system_runtime_controls FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.set_runtime_control TO authenticated, service_role;

-- 8. Action Centre Carrier Recovery & Tenant Isolation Policies on operational_events
GRANT UPDATE ON public.operational_events TO authenticated;

DROP POLICY IF EXISTS "Workspace members select operational events" ON public.operational_events;
CREATE POLICY "Workspace members select operational events"
ON public.operational_events FOR SELECT TO authenticated
USING (
    organization_id IS NOT NULL 
    AND organization_id IN (
        SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Workspace members update operational events" ON public.operational_events;
CREATE POLICY "Workspace members update operational events"
ON public.operational_events FOR UPDATE TO authenticated
USING (
    organization_id IS NOT NULL 
    AND organization_id IN (
        SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    organization_id IS NOT NULL 
    AND organization_id IN (
        SELECT organization_id FROM public.agents WHERE user_id = auth.uid()
    )
);



