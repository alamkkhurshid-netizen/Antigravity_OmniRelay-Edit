import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (process.env.NODE_ENV === "production") {
      if (!signature || !secret) {
        return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
      }
      const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
      if (expectedSignature !== signature) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    }

    const payload = JSON.parse(rawBody);

    if (payload.event !== "payment.captured" && payload.event !== "refund.created") {
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

    if (payload.event === "refund.created") {
      // Process refund
      const refundId = payload.payload.refund.entity.id;
      const { error: refundError } = await supabaseAdmin.rpc("debit_wallet_for_refund", {
        p_organization_id: organizationId,
        p_amount_paise: amountPaise,
        p_razorpay_payment_id: paymentId,
        p_razorpay_refund_id: refundId,
      });

      if (refundError) {
        console.error("Refund RPC failed:", refundError);
        return NextResponse.json({ error: "Failed to process refund" }, { status: 500 });
      }

      console.log(`Wallet ${organizationId} debited for refund ${refundId}`);
      return NextResponse.json({ success: true, refunded: true });
    }

    // Process payment capture
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
      console.log(`Payment ${paymentId} already credited. Idempotency respected.`);
    } else {
      console.log(`Wallet ${organizationId} credited with ₹${amountPaise / 100}`);
      
      // Automated receipt generation mock
      if (payment.email && process.env.RESEND_API_KEY) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              from: process.env.NOTIFICATION_FROM_EMAIL || "billing@omnirelay.in",
              to: payment.email,
              subject: "Payment Receipt - OmniRelay",
              html: `<p>Thank you for your payment of ₹${amountPaise / 100}.</p><p>Payment ID: ${paymentId}</p>`
            })
          });
        } catch (e) {
          console.error("Failed to send receipt:", e);
        }
      }
    }

    return NextResponse.json({ success: true, credited });

  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
