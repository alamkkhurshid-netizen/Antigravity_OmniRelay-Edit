import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedActions = new Set(["resolve", "retry"]);

export async function PATCH(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!organization) {
    return NextResponse.json({ error: "Workspace organization not found." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({})) as {
    id?: string;
    action?: string;
    reason?: string;
  };

  if (!body.id || !uuidRegex.test(body.id)) {
    return NextResponse.json({ error: "Invalid operational event ID." }, { status: 400 });
  }

  if (!body.action || !allowedActions.has(body.action)) {
    return NextResponse.json({ error: "Invalid action. Must be 'resolve' or 'retry'." }, { status: 400 });
  }

  if (!body.reason || body.reason.trim().length < 3) {
    return NextResponse.json({ error: "A reason (min 3 characters) is required." }, { status: 400 });
  }

  // 1. Fetch event verifying tenant isolation (cross-tenant protection)
  const { data: existing, error: fetchError } = await supabase
    .from("operational_events")
    .select("id,organization_id,metadata,event_source")
    .eq("id", body.id)
    .eq("organization_id", organization.id)
    .eq("event_source", "voice_carrier_recovery")
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Carrier recovery task not found for this workspace." }, { status: 404 });
  }

  const existingMeta = (existing.metadata as Record<string, unknown>) || {};
  const nowIso = new Date().toISOString();

  if (body.action === "resolve") {
    // 2. Mark event resolved and update metadata
    const updatedMeta = {
      ...existingMeta,
      action_centre_status: "resolved",
      resolved_by: user.id,
      resolution_reason: body.reason.trim(),
      resolved_at: nowIso,
    };

    const { data: updated, error: updateError } = await supabase
      .from("operational_events")
      .update({
        resolved_at: nowIso,
        metadata: updatedMeta,
      })
      .eq("id", existing.id)
      .eq("organization_id", organization.id)
      .select("id,resolved_at,metadata")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 403 });
    }

    // 3. Write structured audit history entry
    await supabase.from("operational_events").insert({
      organization_id: organization.id,
      actor_user_id: user.id,
      event_source: "action_centre_recovery",
      error_code: "CARRIER_RECOVERY_RESOLVED",
      safe_message: `Carrier recovery task ${existing.id} closed by staff: ${body.reason.trim()}`,
      severity: "warning",
      metadata: {
        recovery_task_id: existingMeta.recovery_task_id,
        parent_event_id: existing.id,
        action: "resolve",
        reason: body.reason.trim(),
        resolved_by: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      action: "resolve",
      event: updated,
    });
  }

  // action === "retry"
  const updatedMeta = {
    ...existingMeta,
    action_centre_status: "manual_retry_queued",
    retry_requested_by: user.id,
    retry_reason: body.reason.trim(),
    retry_requested_at: nowIso,
  };

  const { data: updated, error: updateError } = await supabase
    .from("operational_events")
    .update({
      metadata: updatedMeta,
    })
    .eq("id", existing.id)
    .eq("organization_id", organization.id)
    .select("id,metadata")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 403 });
  }

  // Write audit event for retry
  await supabase.from("operational_events").insert({
    organization_id: organization.id,
    actor_user_id: user.id,
    event_source: "action_centre_recovery",
    error_code: "CARRIER_RECOVERY_RETRY_QUEUED",
    safe_message: `Manual retry queued for carrier recovery task ${existing.id} by staff: ${body.reason.trim()}`,
    severity: "warning",
    metadata: {
      recovery_task_id: existingMeta.recovery_task_id,
      parent_event_id: existing.id,
      action: "retry",
      reason: body.reason.trim(),
      requested_by: user.id,
    },
  });

  return NextResponse.json({
    success: true,
    action: "retry",
    event: updated,
  });
}
