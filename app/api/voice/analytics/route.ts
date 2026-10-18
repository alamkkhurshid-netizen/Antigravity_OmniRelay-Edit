import { NextRequest, NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeVoiceAnalytics, VoiceCallLog } from "@/lib/voice/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { organization } = await getWorkspace();
    const { searchParams } = new URL(req.url);
    const targetOrgId = searchParams.get("org_id") || organization?.id;
    const days = Math.min(Number(searchParams.get("days") || 30), 90);

    if (!targetOrgId) {
      return NextResponse.json({ error: "Missing organization context" }, { status: 400 });
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
