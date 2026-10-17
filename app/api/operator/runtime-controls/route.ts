import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export const ALLOWED_CONTROL_KEYS = [
  "WORKER_ENABLED",
  "WHATSAPP_INBOUND_WORKER_ENABLED",
  "APPOINTMENT_REMINDER_WORKER_ENABLED",
  "CARE_REMINDER_WORKER_ENABLED",
  "CAMPAIGN_WORKER_ENABLED",
  "CAMPAIGN_DISPATCH_WORKER_ENABLED",
  "AUTOMATION_RUNNER_WORKER_ENABLED",
  "DOCTOR_QUEUE_WORKER_ENABLED",
  "DEVICE_PUSH_WORKER_ENABLED",
  "DEPOSIT_ACCEPTANCE_WORKER_ENABLED",
  "ROSTER_DISPATCH_WORKER_ENABLED",
  "TOKEN_HEALTH_WORKER_ENABLED",
  "GROWTH_OFFICER_WORKER_ENABLED",
  "VOICE_PILOT_KILL_SWITCH",
  "VOICE_PROVIDER_FALLBACK",
  "RECORD_AND_DEDUCT_METERING",
  "EMERGENCY_OVERRIDE",
] as const;

interface RuntimeControlPayload {
  controlKey: string;
  isEnabled: boolean;
  scope?: "global" | "tenant";
  organizationId?: string | null;
  reason: string;
  expectedVersion?: number | null;
  expiresAt?: string | null;
  isEmergency?: boolean;
}

export async function POST(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const admin = createAdminClient();

    // Check if user is in private.platform_operators
    const { data: operatorRecord } = await admin
      .schema("private")
      .from("platform_operators")
      .select("user_id, role, active")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    const isPlatformOperator = Boolean(operatorRecord);

    const body = (await request.json().catch(() => ({}))) as Partial<RuntimeControlPayload>;

    // 1. Validate control key against explicit allowlist
    if (!body.controlKey || !(ALLOWED_CONTROL_KEYS as readonly string[]).includes(body.controlKey)) {
      await admin.from("operational_events").insert({
        organization_id: organization?.id ?? null,
        actor_user_id: user.id,
        event_source: "runtime_control_operator",
        error_code: "RUNTIME_CONTROL_DENIED",
        safe_message: `Denied update for unallowed or missing control key: ${body.controlKey || "missing"}`,
        severity: "warning",
        metadata: {
          control_key: body.controlKey,
          actor_id: user.id,
          reason: "unallowed_control_key",
        },
      });
      return NextResponse.json(
        { error: `Invalid or unallowed controlKey. Permitted keys: ${ALLOWED_CONTROL_KEYS.join(", ")}` },
        { status: 400 }
      );
    }

    if (typeof body.isEnabled !== "boolean") {
      return NextResponse.json(
        { error: "Invalid payload: isEnabled (boolean) is required." },
        { status: 400 }
      );
    }

    const scope = body.scope ?? "global";
    if (scope !== "global" && scope !== "tenant") {
      return NextResponse.json(
        { error: "Invalid scope. Permitted values are strictly 'global' or 'tenant'." },
        { status: 400 }
      );
    }

    const reason = body.reason?.trim();
    if (!reason || reason.length < 5) {
      await admin.from("operational_events").insert({
        organization_id: organization?.id ?? null,
        actor_user_id: user.id,
        event_source: "runtime_control_operator",
        error_code: "RUNTIME_CONTROL_DENIED",
        safe_message: `Denied runtime control update for ${body.controlKey}: insufficient justification reason.`,
        severity: "warning",
        metadata: {
          control_key: body.controlKey,
          actor_id: user.id,
          reason: "missing_justification",
        },
      });
      return NextResponse.json(
        { error: "A descriptive reason (minimum 5 characters) is required for audited control updates." },
        { status: 400 }
      );
    }

    const isEmergency = Boolean(body.isEmergency);
    if (isEmergency) {
      if (!body.expiresAt || new Date(body.expiresAt).getTime() <= Date.now()) {
        await admin.from("operational_events").insert({
          organization_id: organization?.id ?? null,
          actor_user_id: user.id,
          event_source: "runtime_control_operator",
          error_code: "RUNTIME_CONTROL_DENIED",
          safe_message: `Denied emergency override for ${body.controlKey}: missing future expiry timestamp.`,
          severity: "warning",
          metadata: {
            control_key: body.controlKey,
            actor_id: user.id,
            reason: "missing_emergency_expiry",
          },
        });
        return NextResponse.json(
          { error: "Emergency overrides strictly require a future expiration timestamp (expiresAt)." },
          { status: 400 }
        );
      }
    }

    // 2. Scope-Specific Authorization Enforcement
    let targetOrgId: string | null = null;

    if (scope === "global") {
      // Global controls: ONLY records in private.platform_operators.
      // Do NOT treat admin or owner in a clinic workspace as a platform operator!
      if (!isPlatformOperator) {
        await admin.from("operational_events").insert({
          organization_id: organization?.id ?? null,
          actor_user_id: user.id,
          event_source: "runtime_control_operator",
          error_code: "RUNTIME_CONTROL_DENIED",
          safe_message: `Denied global control update for ${body.controlKey}: user ${user.id} is not in private.platform_operators.`,
          severity: "critical",
          metadata: {
            control_key: body.controlKey,
            actor_id: user.id,
            reason: "platform_operator_required",
            scope: "global",
          },
        });
        return NextResponse.json(
          { error: "Forbidden: Global controls strictly require platform operator authorization." },
          { status: 403 }
        );
      }
    } else {
      // scope === "tenant"
      // Prevent caller-supplied cross-tenant organization IDs:
      // A tenant administrator must NEVER provide another organisation ID.
      if (!isPlatformOperator) {
        if (body.organizationId && organization?.id && body.organizationId !== organization.id) {
          await admin.from("operational_events").insert({
            organization_id: organization.id,
            actor_user_id: user.id,
            event_source: "runtime_control_operator",
            error_code: "RUNTIME_CONTROL_DENIED",
            safe_message: `Denied cross-tenant control attempt by user ${user.id} targeting org ${body.organizationId}.`,
            severity: "critical",
            metadata: {
              control_key: body.controlKey,
              actor_id: user.id,
              target_org_id: body.organizationId,
              caller_org_id: organization.id,
              reason: "cross_tenant_spoofing_prevented",
            },
          });
          return NextResponse.json(
            { error: "Forbidden: Cross-tenant organization modification denied. Tenant administrators may only manage their own organization." },
            { status: 403 }
          );
        }
        targetOrgId = organization?.id ?? null;
      } else {
        targetOrgId = body.organizationId || organization?.id || null;
      }

      if (!targetOrgId) {
        return NextResponse.json(
          { error: "organizationId is required when scope is 'tenant'." },
          { status: 400 }
        );
      }

      // Verify that caller is owner or admin of that exact organisation
      if (!isPlatformOperator) {
        const { data: agentMembership } = await admin
          .from("agents")
          .select("role, extra")
          .eq("organization_id", targetOrgId)
          .eq("user_id", user.id)
          .maybeSingle();

        const memberRole = (agentMembership?.extra as Record<string, unknown> | null)?.role ?? agentMembership?.role;
        const isTenantAdminOrOwner = ["admin", "owner"].includes(String(memberRole));

        if (!isTenantAdminOrOwner) {
          await admin.from("operational_events").insert({
            organization_id: targetOrgId,
            actor_user_id: user.id,
            event_source: "runtime_control_operator",
            error_code: "RUNTIME_CONTROL_DENIED",
            safe_message: `Denied tenant control update for ${body.controlKey} on org ${targetOrgId}: user ${user.id} has role '${memberRole}', but owner or admin is required.`,
            severity: "critical",
            metadata: {
              control_key: body.controlKey,
              organization_id: targetOrgId,
              actor_id: user.id,
              reason: "tenant_admin_or_owner_required",
              scope: "tenant",
            },
          });
          return NextResponse.json(
            { error: "Forbidden: Tenant owner or admin privileges required for this organization." },
            { status: 403 }
          );
        }
      }
    }

    // Execute via RPC passing p_actor_id for end-to-end audit tracking and DB-level authorization
    const { data, error } = await admin.rpc("set_runtime_control", {
      p_control_key: body.controlKey,
      p_is_enabled: body.isEnabled,
      p_scope: scope,
      p_organization_id: targetOrgId,
      p_reason: reason,
      p_expected_version: body.expectedVersion ?? null,
      p_expires_at: body.expiresAt ?? null,
      p_is_emergency: isEmergency,
      p_actor_id: user.id,
    });

    if (error) {
      const isVersionMismatch = error.message?.includes("Optimistic concurrency failure");
      const isForbidden = error.message?.includes("Platform operator authorization required") || error.message?.includes("Tenant admin or owner authorization required");
      return NextResponse.json(
        { error: error.message },
        { status: isVersionMismatch ? 409 : isForbidden ? 403 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      control: data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
