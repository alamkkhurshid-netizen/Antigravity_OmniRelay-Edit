import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedActions = new Set(["claim", "resolve", "retry"]);

interface CarrierRecoveryPayload {
  id?: string;
  action?: string;
  reason?: string;
  expectedVersion?: number | null;
}

interface TransitionCarrierRpcResponse {
  success: boolean;
  status: number;
  error?: string;
  action?: string;
  version?: number;
  event?: Record<string, unknown>;
}

export async function PATCH(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!organization) {
      return NextResponse.json({ error: "Workspace organization not found." }, { status: 409 });
    }

    const body = (await request.json().catch(() => ({}))) as CarrierRecoveryPayload;

    if (!body.id || !uuidRegex.test(body.id)) {
      return NextResponse.json({ error: "Invalid operational event ID." }, { status: 400 });
    }

    if (!body.action || !allowedActions.has(body.action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'claim', 'resolve', or 'retry'." },
        { status: 400 }
      );
    }

    // 1. Mandatory expectedVersion requirement for optimistic concurrency control
    if (body.expectedVersion === undefined || body.expectedVersion === null) {
      return NextResponse.json(
        { error: "expectedVersion is strictly required for optimistic concurrency control." },
        { status: 400 }
      );
    }

    if (body.action !== "claim" && (!body.reason || body.reason.trim().length < 3)) {
      return NextResponse.json(
        { error: "A reason (min 3 characters) is required to resolve or retry." },
        { status: 400 }
      );
    }

    // 2. Role Authorization: Staff role must be owner, admin, or receptionist
    const { data: actor } = await supabase
      .from("agents")
      .select("role, extra")
      .eq("organization_id", organization.id)
      .eq("user_id", user.id)
      .maybeSingle();

    const role = String((actor?.extra as Record<string, unknown> | null)?.role ?? actor?.role ?? "member");
    const isStaffAuthorized = ["owner", "admin", "receptionist"].includes(role);

    if (!isStaffAuthorized) {
      await supabase.from("operational_events").insert({
        organization_id: organization.id,
        actor_user_id: user.id,
        event_source: "action_centre_recovery",
        error_code: "CARRIER_RECOVERY_DENIED",
        safe_message: `Unauthorized carrier recovery attempt: user ${user.id} has role '${role}', but owner, admin, or receptionist is required.`,
        severity: "critical",
        metadata: {
          caller_id: user.id,
          caller_role: role,
          reason: "role_not_authorized",
        },
      });
      return NextResponse.json(
        { error: "Forbidden: Receptionist or administrator role required for carrier recovery." },
        { status: 403 }
      );
    }

    // 3. Execute atomic state transition via PostgreSQL RPC (SELECT ... FOR UPDATE)
    // The authenticated RPC is the sole authoritative path. Service-role fallback is prohibited to prevent privilege escalation.
    const { data: rpcResult, error: rpcError } = await supabase.rpc("transition_carrier_recovery_task", {
      p_task_id: body.id,
      p_action: body.action,
      p_expected_version: body.expectedVersion,
      p_reason: body.reason ?? null,
      p_organization_id: organization.id,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const result = rpcResult as TransitionCarrierRpcResponse;

    if (!result.success) {
      // Never retry 400, 401, 403, 404, 409, validation, authorization, or concurrency errors through service role
      return NextResponse.json(
        { error: result.error || "Carrier recovery transition failed." },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      action: result.action,
      version: result.version,
      event: result.event,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
