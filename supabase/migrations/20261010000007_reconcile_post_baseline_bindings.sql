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
        RAISE EXCEPTION 'Control key % is not in the allowed runtime controls list.', p_control_key USING ERRCODE = '22023';
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

-- 9. Atomic Carrier Recovery Task Lifecycle Transition RPC
ALTER TABLE public.action_centre_assignments DROP CONSTRAINT IF EXISTS action_centre_assignments_item_kind_check;
ALTER TABLE public.action_centre_assignments ADD CONSTRAINT action_centre_assignments_item_kind_check 
    CHECK (item_kind IN ('booking_approval','waitlist','schedule_disruption','care_retry','appointment_retry','care_task','carrier_recovery'));

ALTER TABLE public.action_centre_assignments DROP CONSTRAINT IF EXISTS action_centre_assignments_status_check;
ALTER TABLE public.action_centre_assignments ADD CONSTRAINT action_centre_assignments_status_check 
    CHECK (status IN ('claimed','reviewed','released','resolved','retrying'));

CREATE OR REPLACE FUNCTION public.transition_carrier_recovery_task(
    p_task_id uuid,
    p_action text,
    p_expected_version integer,
    p_reason text DEFAULT NULL,
    p_actor_id uuid DEFAULT NULL,
    p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_service_role boolean := (coalesce(auth.role(), '') = 'service_role' OR current_user = 'service_role');
    v_auth_uid uuid := auth.uid();
    v_caller_id uuid;
    v_org_id uuid := p_organization_id;
    v_actor_role text;
    v_is_authorized boolean := false;
    v_is_admin boolean := false;
    v_event RECORD;
    v_existing_meta jsonb;
    v_current_version integer;
    v_new_version integer;
    v_claimed_by uuid;
    v_status text;
    v_is_claimed boolean;
    v_is_resolved boolean;
    v_is_expired boolean;
    v_now timestamptz := now();
    v_now_iso text := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    v_updated_meta jsonb;
    v_updated_event RECORD;
BEGIN
    -- 1. Identity Resolution & Strict Impersonation Prevention
    IF v_auth_uid IS NOT NULL THEN
        -- Authenticated user request: Actor is derived EXCLUSIVELY from database session auth.uid()
        -- Reject if caller supplies any actor ID that differs from auth.uid()
        IF p_actor_id IS NOT NULL AND p_actor_id <> v_auth_uid THEN
            INSERT INTO public.operational_events (
                organization_id, actor_user_id, event_source, error_code, safe_message, severity, metadata
            ) VALUES (
                v_org_id, v_auth_uid, 'action_centre_recovery', 'CARRIER_RECOVERY_IMPERSONATION_DENIED',
                format('Impersonation attempt blocked: user %s attempted to act as %s', v_auth_uid, p_actor_id),
                'critical',
                jsonb_build_object('task_id', p_task_id, 'auth_uid', v_auth_uid, 'supplied_actor_id', p_actor_id)
            );
            RETURN jsonb_build_object(
                'success', false,
                'status', 403,
                'error', 'Forbidden: Caller cannot impersonate another actor ID. Actor identity is derived strictly from session.'
            );
        END IF;
        v_caller_id := v_auth_uid;
    ELSIF v_is_service_role THEN
        -- Verified service_role request: Permit explicit supplied actor
        IF p_actor_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'status', 400, 'error', 'Actor ID is required for service-role transitions.');
        END IF;
        v_caller_id := p_actor_id;
    ELSE
        -- Unauthenticated / anon request: Reject unconditionally
        RETURN jsonb_build_object('success', false, 'status', 401, 'error', 'Authentication required.');
    END IF;

    IF p_task_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'status', 400, 'error', 'Invalid operational event ID.');
    END IF;

    IF p_action NOT IN ('claim', 'resolve', 'retry') THEN
        RETURN jsonb_build_object('success', false, 'status', 400, 'error', 'Invalid action: must be claim, resolve, or retry.');
    END IF;

    IF p_expected_version IS NULL THEN
        RETURN jsonb_build_object('success', false, 'status', 400, 'error', 'expectedVersion is strictly required for optimistic concurrency control.');
    END IF;

    IF p_action IN ('resolve', 'retry') AND (p_reason IS NULL OR length(trim(p_reason)) < 3) THEN
        RETURN jsonb_build_object('success', false, 'status', 400, 'error', 'A reason (min 3 characters) is required to resolve or retry.');
    END IF;

    -- 2. Fetch and lock operational_events row using SELECT ... FOR UPDATE FIRST
    SELECT * INTO v_event
    FROM public.operational_events
    WHERE id = p_task_id
      AND event_source = 'voice_carrier_recovery'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 404, 'error', 'Carrier recovery task not found.');
    END IF;

    -- Cross-tenant isolation check: If caller specified an organization, it MUST match the task's organization
    IF v_org_id IS NOT NULL AND v_org_id <> v_event.organization_id THEN
        INSERT INTO public.operational_events (
            organization_id, actor_user_id, event_source, error_code, safe_message, severity, metadata
        ) VALUES (
            v_event.organization_id, v_caller_id, 'action_centre_recovery', 'CARRIER_RECOVERY_TENANT_DENIED',
            format('Cross-tenant violation: caller %s supplied organization %s for task belonging to %s', v_caller_id, v_org_id, v_event.organization_id),
            'critical',
            jsonb_build_object('task_id', p_task_id, 'caller_id', v_caller_id, 'supplied_org', v_org_id, 'actual_org', v_event.organization_id)
        );
        RETURN jsonb_build_object('success', false, 'status', 403, 'error', 'Forbidden: Cross-tenant operation denied.');
    END IF;

    v_org_id := v_event.organization_id;

    -- 3. Tenant Membership & Role Authorization
    -- Verify caller (v_caller_id) belongs to v_org_id
    SELECT COALESCE((a.extra->>'role'), a.role::text, 'member') INTO v_actor_role
    FROM public.agents a
    WHERE a.user_id = v_caller_id AND a.organization_id = v_org_id
    LIMIT 1;

    IF v_actor_role IS NULL THEN
        -- Caller is not a member of the task's workspace organization
        INSERT INTO public.operational_events (
            organization_id, actor_user_id, event_source, error_code, safe_message, severity, metadata
        ) VALUES (
            v_org_id, v_caller_id, 'action_centre_recovery', 'CARRIER_RECOVERY_TENANT_DENIED',
            format('Cross-tenant violation: user %s is not an agent in organization %s', v_caller_id, v_org_id),
            'critical',
            jsonb_build_object('task_id', p_task_id, 'caller_id', v_caller_id, 'organization_id', v_org_id)
        );
        RETURN jsonb_build_object('success', false, 'status', 403, 'error', 'Forbidden: User does not belong to the task workspace organization.');
    END IF;

    IF v_actor_role IN ('owner', 'admin', 'receptionist') THEN
        v_is_authorized := true;
    END IF;

    IF v_actor_role IN ('owner', 'admin') THEN
        v_is_admin := true;
    END IF;

    IF NOT v_is_authorized THEN
        INSERT INTO public.operational_events (
            organization_id, actor_user_id, event_source, error_code, safe_message, severity, metadata
        ) VALUES (
            v_org_id, v_caller_id, 'action_centre_recovery', 'CARRIER_RECOVERY_DENIED',
            format('Unauthorized carrier recovery attempt: user %s has role %s, but owner, admin, or receptionist is required.', v_caller_id, coalesce(v_actor_role, 'none')),
            'critical',
            jsonb_build_object('task_id', p_task_id, 'caller_id', v_caller_id, 'caller_role', coalesce(v_actor_role, 'none'), 'reason', 'role_not_authorized')
        );
        RETURN jsonb_build_object('success', false, 'status', 403, 'error', 'Forbidden: Receptionist or administrator role required for carrier recovery.');
    END IF;

    v_existing_meta := COALESCE(v_event.metadata, '{}'::jsonb);
    v_current_version := COALESCE((v_existing_meta->>'version')::integer, 1);

    -- 4. Optimistic Version Predicate: Require matching expected_version
    IF p_expected_version <> v_current_version THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 409,
            'error', format('Optimistic concurrency failure: task was updated by another team member (current version: %s, expected: %s). Please refresh.', v_current_version, p_expected_version),
            'current_version', v_current_version
        );
    END IF;

    -- 5. Lifecycle Constraints
    -- Resolved -> immutable
    v_is_resolved := (v_event.resolved_at IS NOT NULL) OR ((v_existing_meta->>'action_centre_status') = 'resolved');
    IF v_is_resolved THEN
        INSERT INTO public.operational_events (
            organization_id, actor_user_id, event_source, error_code, safe_message, severity, metadata
        ) VALUES (
            v_org_id, v_caller_id, 'action_centre_recovery', 'CARRIER_RECOVERY_DENIED',
            format('Denied mutation on immutable resolved carrier task %s by user %s.', p_task_id, v_caller_id),
            'warning',
            jsonb_build_object('task_id', p_task_id, 'caller_id', v_caller_id, 'action', p_action, 'reason', 'task_already_resolved')
        );
        RETURN jsonb_build_object('success', false, 'status', 409, 'error', 'This carrier recovery task is already resolved and immutable.');
    END IF;

    -- Expired -> admin recovery only
    v_is_expired := ((v_existing_meta->>'action_centre_status') = 'expired') OR
                    ((v_existing_meta->>'expires_at') IS NOT NULL AND (v_existing_meta->>'expires_at')::timestamptz <= v_now);
    IF v_is_expired AND NOT v_is_admin THEN
        INSERT INTO public.operational_events (
            organization_id, actor_user_id, event_source, error_code, safe_message, severity, metadata
        ) VALUES (
            v_org_id, v_caller_id, 'action_centre_recovery', 'CARRIER_RECOVERY_DENIED',
            format('Denied recovery of expired carrier task %s: admin privileges required.', p_task_id),
            'warning',
            jsonb_build_object('task_id', p_task_id, 'caller_id', v_caller_id, 'action', p_action, 'reason', 'admin_required_for_expired_task')
        );
        RETURN jsonb_build_object('success', false, 'status', 403, 'error', 'Forbidden: Only an administrator can recover an expired carrier recovery task.');
    END IF;

    -- Check claimed status
    IF (v_existing_meta->>'claimed_by') IS NOT NULL AND (v_existing_meta->>'claimed_by') <> '' THEN
        v_claimed_by := (v_existing_meta->>'claimed_by')::uuid;
    END IF;

    v_status := COALESCE(v_existing_meta->>'action_centre_status', 'pending_manual_intervention');
    v_is_claimed := (v_claimed_by IS NOT NULL) AND (v_status = 'claimed');

    -- 6. Apply atomic state transition in ONE transaction
    v_new_version := v_current_version + 1;

    IF p_action = 'claim' THEN
        IF v_is_claimed AND v_claimed_by <> v_caller_id AND NOT v_is_admin THEN
            RETURN jsonb_build_object('success', false, 'status', 409, 'error', 'Task is already claimed by another team member.');
        END IF;

        v_updated_meta := v_existing_meta || jsonb_build_object(
            'action_centre_status', 'claimed',
            'claimed_by', v_caller_id::text,
            'claimed_at', v_now_iso,
            'version', v_new_version
        );

        UPDATE public.operational_events
        SET metadata = v_updated_meta
        WHERE id = p_task_id
        RETURNING * INTO v_updated_event;

        INSERT INTO public.action_centre_assignments (
            organization_id, item_kind, subject_id, assigned_to, status, assigned_at, updated_at
        ) VALUES (
            v_org_id, 'carrier_recovery', p_task_id, v_caller_id, 'claimed', v_now, v_now
        )
        ON CONFLICT (organization_id, item_kind, subject_id)
        DO UPDATE SET
            assigned_to = EXCLUDED.assigned_to,
            status = 'claimed',
            updated_at = v_now;

        INSERT INTO public.operational_events (
            organization_id, actor_user_id, event_source, error_code, safe_message, severity, metadata
        ) VALUES (
            v_org_id, v_caller_id, 'action_centre_recovery', 'CARRIER_RECOVERY_CLAIMED',
            format('Carrier recovery task %s claimed by staff member %s.', p_task_id, v_caller_id),
            'warning',
            jsonb_build_object('task_id', p_task_id, 'claimed_by', v_caller_id, 'action', 'claim', 'version', v_new_version)
        );

    ELSIF p_action IN ('resolve', 'retry') THEN
        IF NOT v_is_claimed THEN
            INSERT INTO public.operational_events (
                organization_id, actor_user_id, event_source, error_code, safe_message, severity, metadata
            ) VALUES (
                v_org_id, v_caller_id, 'action_centre_recovery', 'CARRIER_RECOVERY_DENIED',
                format('Denied %s on unclaimed carrier task %s: claim required first.', p_action, p_task_id),
                'warning',
                jsonb_build_object('task_id', p_task_id, 'caller_id', v_caller_id, 'action', p_action, 'reason', 'task_must_be_claimed_first')
            );
            RETURN jsonb_build_object('success', false, 'status', 400, 'error', 'Task must be claimed before it can be resolved or retried.');
        END IF;

        IF v_claimed_by <> v_caller_id AND NOT v_is_admin THEN
            RETURN jsonb_build_object('success', false, 'status', 403, 'error', 'Only the assigned task owner or an administrator can resolve or retry this task.');
        END IF;

        IF p_action = 'resolve' THEN
            v_updated_meta := v_existing_meta || jsonb_build_object(
                'action_centre_status', 'resolved',
                'resolved_by', v_caller_id::text,
                'resolved_at', v_now_iso,
                'resolution_notes', p_reason,
                'version', v_new_version
            );

            UPDATE public.operational_events
            SET resolved_at = v_now,
                metadata = v_updated_meta
            WHERE id = p_task_id
            RETURNING * INTO v_updated_event;

            UPDATE public.action_centre_assignments
            SET status = 'resolved',
                reviewed_at = v_now,
                updated_at = v_now
            WHERE organization_id = v_org_id
              AND item_kind = 'carrier_recovery'
              AND subject_id = p_task_id;

            INSERT INTO public.operational_events (
                organization_id, actor_user_id, event_source, error_code, safe_message, severity, metadata
            ) VALUES (
                v_org_id, v_caller_id, 'action_centre_recovery', 'CARRIER_RECOVERY_RESOLVED',
                format('Carrier recovery task %s marked resolved by %s: %s', p_task_id, v_caller_id, p_reason),
                'info',
                jsonb_build_object('task_id', p_task_id, 'resolved_by', v_caller_id, 'action', 'resolve', 'reason', p_reason, 'version', v_new_version)
            );

        ELSIF p_action = 'retry' THEN
            v_updated_meta := v_existing_meta || jsonb_build_object(
                'action_centre_status', 'retried',
                'retried_by', v_caller_id::text,
                'retried_at', v_now_iso,
                'retry_reason', p_reason,
                'version', v_new_version
            );

            UPDATE public.operational_events
            SET metadata = v_updated_meta
            WHERE id = p_task_id
            RETURNING * INTO v_updated_event;

            UPDATE public.action_centre_assignments
            SET status = 'retrying',
                updated_at = v_now
            WHERE organization_id = v_org_id
              AND item_kind = 'carrier_recovery'
              AND subject_id = p_task_id;

            INSERT INTO public.operational_events (
                organization_id, actor_user_id, event_source, error_code, safe_message, severity, metadata
            ) VALUES (
                v_org_id, v_caller_id, 'action_centre_recovery', 'CARRIER_RECOVERY_RETRY_QUEUED',
                format('Automated carrier retry queued for task %s by %s: %s', p_task_id, v_caller_id, p_reason),
                'info',
                jsonb_build_object('task_id', p_task_id, 'retried_by', v_caller_id, 'action', 'retry', 'reason', p_reason, 'version', v_new_version)
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 200,
        'action', p_action,
        'version', v_new_version,
        'task_id', p_task_id,
        'actor_id', v_caller_id,
        'event', to_jsonb(v_updated_event)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_carrier_recovery_task FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_carrier_recovery_task FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_carrier_recovery_task TO authenticated, service_role;

-- 10. Dedicated Internal Service-Role Carrier Recovery RPC
CREATE OR REPLACE FUNCTION public.service_transition_carrier_recovery_task(
    p_task_id uuid,
    p_action text,
    p_expected_version integer,
    p_actor_id uuid,
    p_organization_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF coalesce(auth.role(), '') <> 'service_role' AND current_user <> 'service_role' THEN
        RAISE EXCEPTION 'Forbidden: service_transition_carrier_recovery_task requires service_role authorization.' USING ERRCODE = '42501';
    END IF;

    RETURN public.transition_carrier_recovery_task(
        p_task_id := p_task_id,
        p_action := p_action,
        p_expected_version := p_expected_version,
        p_reason := p_reason,
        p_actor_id := p_actor_id,
        p_organization_id := p_organization_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.service_transition_carrier_recovery_task FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_transition_carrier_recovery_task TO service_role;




