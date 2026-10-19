import { NextRequest, NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeVoiceAnalytics, VoiceCallLog } from "@/lib/voice/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { searchParams } = new URL(req.url);
    const requestedOrgId = searchParams.get("org_id");
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") || "7", 10)));
    let targetOrgId = organization?.id;

    if (requestedOrgId && requestedOrgId !== targetOrgId) {
      // Check if caller is a verified platform operator
      const { data: isOperator } = await supabase.rpc("is_oem_operator");
      if (!isOperator) {
        return NextResponse.json(
          { error: "Forbidden: Cross-tenant analytics access denied." },
          { status: 403 }
        );
      }
      targetOrgId = requestedOrgId;
    }

    if (!targetOrgId) {
      return NextResponse.json({ error: "Authentication required: Missing organization context" }, { status: 401 });
    }

    const admin = createAdminClient();
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: logs, error } = await admin
      .from("voice_call_logs")
      .select("id, org_id, contact_phone, direction, duration_seconds, outcome, emergency_flag, latency_metrics, created_at")
      .eq("org_id", targetOrgId)
      .gte("created_at", cutoffDate);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const typedLogs = (logs || []) as VoiceCallLog[];
    const analytics = computeVoiceAnalytics(typedLogs);

    return NextResponse.json({
      organization_id: targetOrgId,
      timeframe_days: days,
      analytics,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
