import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Admin client for secure background operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COST_PER_MINUTE_INR = 2.00; // ₹2.00 per minute for AI Voice

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the Webhook (Optional but recommended in prod)
    // const authHeader = req.headers.get("Authorization");
    
    // 2. Parse the Supabase DB Webhook payload
    // Payload contains the newly inserted row in voice_call_logs
    const payload = await req.json();
    const callLog = payload.record;

    if (!callLog || !callLog.id || !callLog.duration_seconds) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (callLog.cost_inr > 0) {
       // Already billed
       return NextResponse.json({ status: "already_billed" });
    }

    console.log(`[Billing Engine] Processing voice call log: ${callLog.id}`);

    // 3. Calculate the exact cost
    // We bill per minute, rounding up to the nearest minute.
    const billableMinutes = Math.ceil(callLog.duration_seconds / 60);
    const calculatedCost = billableMinutes * COST_PER_MINUTE_INR;

    // 4. Execute the Transaction using RPC or separate updates
    // A) Update the call log with the calculated cost
    const { error: logError } = await supabaseAdmin
      .from("voice_call_logs")
      .update({ cost_inr: calculatedCost })
      .eq("id", callLog.id);

    if (logError) throw logError;

    // B) Deduct from Organization's Wallet Balance (Assume organizations table has a 'wallet_balance' column)
    // Using Supabase RPC is safer to prevent race conditions: `decrement_wallet_balance`
    // For now, we will do a direct update if RPC is not available.
    
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("wallet_balance, name")
      .eq("id", callLog.org_id)
      .single();

    if (org && !orgError) {
      const newBalance = (org.wallet_balance || 0) - calculatedCost;
      
      await supabaseAdmin
        .from("organizations")
        .update({ wallet_balance: newBalance })
        .eq("id", callLog.org_id);
        
      console.log(`[Billing Engine] Billed ${org.name} ₹${calculatedCost}. New Balance: ₹${newBalance}`);
    }

    return NextResponse.json({
      success: true,
      log_id: callLog.id,
      billed_minutes: billableMinutes,
      cost_inr: calculatedCost
    });

  } catch (error: any) {
    console.error("[Billing Engine] Error processing voice call:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
