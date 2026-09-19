import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { recordOperationalError } from "@/lib/operations";

type RetryPayload = {
  kind?: "appointment_reminder" | "care_reminder";
  id?: string;
  reason?: string;
};

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const payload = await request.json().catch(() => ({})) as RetryPayload;
  const reason = payload.reason?.trim() ?? "";
  if (!payload.id || !payload.kind || !["appointment_reminder", "care_reminder"].includes(payload.kind)) {
    return NextResponse.json({ error: "A supported failed automation job is required." }, { status: 400 });
  }
  if (reason.length < 3 || reason.length > 240) {
    return NextResponse.json({ error: "Add a short recovery reason (3–240 characters)." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("retry_failed_automation_job", {
    p_organization_id: organization.id,
    p_job_kind: payload.kind,
    p_job_id: payload.id,
    p_reason: reason,
  });

  if (error) {
    await recordOperationalError({
      organizationId: organization.id,
      actorUserId: user.id,
      source: "automation_recovery",
      code: "MANUAL_RETRY_REJECTED",
      safeMessage: "A failed automation could not be released for retry.",
      metadata: { job_kind: payload.kind, job_id: payload.id },
    });
    return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 409 });
  }

  return NextResponse.json({ recovery: data });
}
