import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Scheduled Voice Retention Purge & Anonymization Worker
 * S9-Retention: Purges expired call transcripts and clinical voice records older than 30 days.
 */
export async function GET(req: Request) {
  try {
    // 1. Mandatory Vercel Cron Security Secret Verification
    if (!process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: "Server configuration error: CRON_SECRET is required to execute retention purge." },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized: Invalid CRON_SECRET authorization." }, { status: 401 });
    }

    const admin = createAdminClient();

    // 2. Execute database purge stored procedure
    let purgedCount = 0;
    try {
      const { data: rpcPurged, error: rpcErr } = await admin.rpc("purge_expired_voice_recordings");
      if (!rpcErr && typeof rpcPurged === "number") {
        purgedCount = rpcPurged;
      }
    } catch {
      // Fallback direct update query if RPC is not present
    }

    // Direct fallback query to guarantee execution
    const nowIso = new Date().toISOString();
    const { data: updatedRows } = await admin
      .from("voice_call_logs")
      .update({
        transcript: [{ speaker: "system", text: "[TRANSCRIPT_PURGED: 30-day retention window expired]" }],
        summary: "[SUMMARY_PURGED_RETENTION_EXPIRED]",
        retention_status: "purged",
        updated_at: nowIso,
      })
      .lt("retention_expires_at", nowIso)
      .eq("retention_status", "active")
      .select("id");

    if (updatedRows && updatedRows.length > 0) {
      purgedCount += updatedRows.length;
    }

    // Clean up expired request nonces older than 24 hours
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await admin
      .from("voice_service_nonces")
      .delete()
      .lt("expires_at", yesterdayIso);

    return NextResponse.json({
      success: true,
      timestamp: nowIso,
      purgedCount,
      message: `Successfully purged ${purgedCount} expired voice records.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
