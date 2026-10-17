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

    // 1. Role Authorization: Staff role must be owner, admin, or receptionist
    const { data: actor } = await supabase
      .from("agents")
      .select("role, extra")
      .eq("organization_id", organization.id)
      .eq("user_id", user.id)
      .maybeSingle();

    const role = String((actor?.extra as Record<string, unknown> | null)?.role ?? actor?.role ?? "member");
    const isStaffAuthorized = ["owner", "admin", "receptionist"].includes(role);
    const isAdmin = ["owner", "admin"].includes(role);

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

    if (body.action !== "claim" && (!body.reason || body.reason.trim().length < 3)) {
      return NextResponse.json(
        { error: "A reason (min 3 characters) is required to resolve or retry." },
        { status: 400 }
      );
    }

    // 2. Fetch event verifying tenant isolation
    const { data: existing, error: fetchError } = await supabase
      .from("operational_events")
      .select("id, organization_id, metadata, event_source, resolved_at, created_at")
      .eq("id", body.id)
      .eq("organization_id", organization.id)
      .eq("event_source", "voice_carrier_recovery")
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Carrier recovery task not found for this workspace." },
        { status: 404 }
      );
    }

    const existingMeta = ((existing.metadata as Record<string, unknown>) || {});
    const nowIso = new Date().toISOString();
    const currentVersion = typeof existingMeta.version === "number" ? existingMeta.version : 1;

    // 3. Optimistic Version Locking
    if (body.expectedVersion !== undefined && body.expectedVersion !== null && body.expectedVersion !== currentVersion) {
      return NextResponse.json(
        { error: `Optimistic concurrency failure: task was updated by another team member (current version: ${currentVersion}, expected: ${body.expectedVersion}). Please refresh.` },
        { status: 409 }
      );
    }

    // 4. Lifecycle Constraint: Resolved → immutable
    const isResolved = Boolean(existing.resolved_at || existingMeta.action_centre_status === "resolved");
    if (isResolved) {
      await supabase.from("operational_events").insert({
        organization_id: organization.id,
        actor_user_id: user.id,
        event_source: "action_centre_recovery",
        error_code: "CARRIER_RECOVERY_DENIED",
        safe_message: `Denied mutation on immutable resolved carrier task ${existing.id} by user ${user.id}.`,
        severity: "warning",
        metadata: {
          task_id: existing.id,
          caller_id: user.id,
          action: body.action,
          reason: "task_already_resolved",
        },
      });
      return NextResponse.json(
        { error: "This carrier recovery task is already resolved and immutable." },
        { status: 409 }
      );
    }

    // 5. Lifecycle Constraint: Expired → admin recovery
    const isExpired = Boolean(
      existingMeta.action_centre_status === "expired" ||
      (existingMeta.expires_at && new Date(existingMeta.expires_at as string).getTime() <= Date.now())
    );

    if (isExpired && !isAdmin) {
      await supabase.from("operational_events").insert({
        organization_id: organization.id,
        actor_user_id: user.id,
        event_source: "action_centre_recovery",
        error_code: "CARRIER_RECOVERY_DENIED",
        safe_message: `Denied recovery of expired carrier task ${existing.id}: admin privileges required.`,
        severity: "warning",
        metadata: {
          task_id: existing.id,
          caller_id: user.id,
          reason: "admin_required_for_expired_task",
        },
      });
      return NextResponse.json(
        { error: "Forbidden: Only an administrator can recover an expired carrier recovery task." },
        { status: 403 }
      );
    }

    // Fetch existing assignment to verify claimant
    const { data: assignment } = await supabase
      .from("action_centre_assignments")
      .select("assigned_to, status, updated_at")
      .eq("organization_id", organization.id)
      .eq("item_kind", "carrier_recovery")
      .eq("subject_id", existing.id)
      .maybeSingle();

    const claimedBy = existingMeta.claimed_by ?? (assignment?.status === "claimed" ? assignment.assigned_to : null);
    const isClaimed = Boolean(claimedBy && (existingMeta.action_centre_status === "claimed" || assignment?.status === "claimed"));

    // 6. Action Execution: Unclaimed → claim; Claimed → resolve/retry by claimant or admin
    if (body.action === "claim") {
      if (isClaimed && claimedBy !== user.id && !isAdmin) {
        return NextResponse.json(
          { error: "Task is already claimed by another team member." },
          { status: 409 }
        );
      }

      const updatedMeta = {
        ...existingMeta,
        action_centre_status: "claimed",
        claimed_by: user.id,
        claimed_at: nowIso,
        version: currentVersion + 1,
      };

      const { data: updated, error: updateError } = await supabase
        .from("operational_events")
        .update({ metadata: updatedMeta })
        .eq("id", existing.id)
        .eq("organization_id", organization.id)
        .select("id, metadata")
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 403 });
      }

      // Record in action_centre_assignments
      await supabase.from("action_centre_assignments").upsert({
        organization_id: organization.id,
        item_kind: "carrier_recovery",
        subject_id: existing.id,
        assigned_to: user.id,
        status: "claimed",
        assigned_at: nowIso,
        updated_at: nowIso,
      }, { onConflict: "organization_id,item_kind,subject_id" });

      // Audit claim
      await supabase.from("operational_events").insert({
        organization_id: organization.id,
        actor_user_id: user.id,
        event_source: "action_centre_recovery",
        error_code: "CARRIER_RECOVERY_CLAIMED",
        safe_message: `Carrier recovery task ${existing.id} claimed by staff member ${user.id}.`,
        severity: "warning",
        metadata: {
          task_id: existing.id,
          claimed_by: user.id,
          action: "claim",
          version: currentVersion + 1,
        },
      });

      return NextResponse.json({
        success: true,
        action: "claim",
        event: updated,
      });
    }

    // For resolve and retry: MUST be claimed first!
    if (!isClaimed) {
      await supabase.from("operational_events").insert({
        organization_id: organization.id,
        actor_user_id: user.id,
        event_source: "action_centre_recovery",
        error_code: "CARRIER_RECOVERY_DENIED",
        safe_message: `Denied ${body.action} on unclaimed carrier task ${existing.id}: claim required first.`,
        severity: "warning",
        metadata: {
          task_id: existing.id,
          caller_id: user.id,
          action: body.action,
          reason: "task_must_be_claimed_first",
        },
      });
      return NextResponse.json(
        { error: "Task must be claimed before it can be resolved or retried." },
        { status: 400 }
      );
    }

    // Must be claimant OR admin
    if (claimedBy !== user.id && !isAdmin) {
      await supabase.from("operational_events").insert({
        organization_id: organization.id,
        actor_user_id: user.id,
        event_source: "action_centre_recovery",
        error_code: "CARRIER_RECOVERY_DENIED",
        safe_message: `Denied ${body.action} on task ${existing.id} claimed by ${claimedBy} from non-admin user ${user.id}.`,
        severity: "warning",
        metadata: {
          task_id: existing.id,
          caller_id: user.id,
          claimed_by: claimedBy,
          action: body.action,
          reason: "claimant_or_admin_required",
        },
      });
      return NextResponse.json(
        { error: "Forbidden: Only the assigned task owner or an administrator can resolve or retry this task." },
        { status: 403 }
      );
    }

    const cleanReason = (body.reason || "").trim();

    if (body.action === "resolve") {
      const updatedMeta = {
        ...existingMeta,
        action_centre_status: "resolved",
        resolved_by: user.id,
        resolution_reason: cleanReason,
        resolved_at: nowIso,
        version: currentVersion + 1,
      };

      const { data: updated, error: updateError } = await supabase
        .from("operational_events")
        .update({
          resolved_at: nowIso,
          metadata: updatedMeta,
        })
        .eq("id", existing.id)
        .eq("organization_id", organization.id)
        .select("id, resolved_at, metadata")
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 403 });
      }

      await supabase.from("action_centre_assignments").upsert({
        organization_id: organization.id,
        item_kind: "carrier_recovery",
        subject_id: existing.id,
        assigned_to: user.id,
        status: "reviewed",
        reviewed_at: nowIso,
        updated_at: nowIso,
      }, { onConflict: "organization_id,item_kind,subject_id" });

      await supabase.from("operational_events").insert({
        organization_id: organization.id,
        actor_user_id: user.id,
        event_source: "action_centre_recovery",
        error_code: "CARRIER_RECOVERY_RESOLVED",
        safe_message: `Carrier recovery task ${existing.id} resolved by staff: ${cleanReason}`,
        severity: "warning",
        metadata: {
          recovery_task_id: existingMeta.recovery_task_id,
          parent_event_id: existing.id,
          action: "resolve",
          reason: cleanReason,
          resolved_by: user.id,
          version: currentVersion + 1,
        },
      });

      return NextResponse.json({
        success: true,
        action: "resolve",
        event: updated,
      });
    }

    // body.action === "retry"
    const updatedMeta = {
      ...existingMeta,
      action_centre_status: "manual_retry_queued",
      retry_requested_by: user.id,
      retry_reason: cleanReason,
      retry_requested_at: nowIso,
      version: currentVersion + 1,
    };

    const { data: updated, error: updateError } = await supabase
      .from("operational_events")
      .update({ metadata: updatedMeta })
      .eq("id", existing.id)
      .eq("organization_id", organization.id)
      .select("id, metadata")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 403 });
    }

    await supabase.from("action_centre_assignments").upsert({
      organization_id: organization.id,
      item_kind: "carrier_recovery",
      subject_id: existing.id,
      assigned_to: user.id,
      status: "claimed",
      updated_at: nowIso,
    }, { onConflict: "organization_id,item_kind,subject_id" });

    await supabase.from("operational_events").insert({
      organization_id: organization.id,
      actor_user_id: user.id,
      event_source: "action_centre_recovery",
      error_code: "CARRIER_RECOVERY_RETRY_QUEUED",
      safe_message: `Manual retry queued for carrier recovery task ${existing.id} by staff: ${cleanReason}`,
      severity: "warning",
      metadata: {
        recovery_task_id: existingMeta.recovery_task_id,
        parent_event_id: existing.id,
        action: "retry",
        reason: cleanReason,
        requested_by: user.id,
        version: currentVersion + 1,
      },
    });

    return NextResponse.json({
      success: true,
      action: "retry",
      event: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
