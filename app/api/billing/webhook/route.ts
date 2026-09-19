import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
// Note: We use the service role key here because Webhooks aren't authenticated by a user session.
// We must bypass RLS to credit the wallet.

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // Verify Razorpay signature in production...
    // const signature = request.headers.get("x-razorpay-signature");

    if (payload.event !== "payment.captured") {
      return NextResponse.json({ received: true });
    }

    const payment = payload.payload.payment.entity;
    
    // Notes attached to the Razorpay order should contain the target organization_id
    const organizationId = payment.notes?.organization_id;
    const amountPaise = payment.amount;
    const paymentId = payment.id;

    if (!organizationId || !paymentId) {
      console.error("Webhook missing org id or payment id");
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Initialize Supabase Admin client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Call our Idempotent RPC to securely credit the wallet
    const { data: credited, error } = await supabaseAdmin.rpc("credit_wallet", {
      p_organization_id: organizationId,
      p_amount_paise: amountPaise,
      p_razorpay_payment_id: paymentId,
    });

    if (error) {
      console.error("Wallet credit RPC failed:", error);
      return NextResponse.json({ error: "Failed to process credit" }, { status: 500 });
    }

    if (!credited) {
      // This means the Razorpay Payment ID was already in our wallet_transactions table.
      // This is expected during webhook retries.
      console.log(`Payment ${paymentId} already credited. Idempotency respected.`);
    } else {
      console.log(`Wallet ${organizationId} credited with ₹${amountPaise / 100}`);
    }

    return NextResponse.json({ success: true, credited });

  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
