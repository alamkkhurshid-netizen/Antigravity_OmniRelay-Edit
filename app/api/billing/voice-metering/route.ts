import { NextRequest, NextResponse } from "next/server";
import { recordAndDeduct } from "@/lib/billing/deduction-engine";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const callLog = payload.record;

    if (!callLog || !callLog.id || !callLog.duration_seconds || !callLog.org_id) {
      return NextResponse.json({ error: "Invalid call log payload" }, { status: 400 });
    }

    if (callLog.cost_inr && callLog.cost_inr > 0) {
      return NextResponse.json({ status: "already_billed" });
    }

    // Billable duration calculated in 60-second standard pulses
    const billableMinutes = Math.max(1, Math.ceil(callLog.duration_seconds / 60));
    
    // Perform atomic deduction for voice call with accurate minute quantity
    const deduction = await recordAndDeduct(
      callLog.org_id,
      `call_${callLog.id}`,
      "voice",
      "voice",
      "IN",
      billableMinutes
    );

    // Update voice call log with calculated cost and deduction status
    const supabaseAdmin = createAdminClient();
    await supabaseAdmin
      .from("voice_call_logs")
      .update({
        cost_inr: deduction.deductedInr,
        updated_at: new Date().toISOString(),
      })
      .eq("id", callLog.id);

    console.log(
      `[Voice Metering] Billed org ${callLog.org_id} ₹${deduction.deductedInr} ` +
      `for ${billableMinutes}m call (${callLog.id}). Balance remaining: ₹${deduction.newBalanceInr}`
    );

    return NextResponse.json({
      success: true,
      log_id: callLog.id,
      billed_minutes: billableMinutes,
      cost_inr: deduction.deductedInr,
      balance_remaining_inr: deduction.newBalanceInr,
      warning_triggered: deduction.warningTriggered,
      critical_triggered: deduction.criticalTriggered,
    });

  } catch (error: any) {
    console.error("[Voice Metering] Metering deduction failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
