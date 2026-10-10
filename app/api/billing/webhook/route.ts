import { NextResponse } from "next/server";
import crypto from "crypto";
import { creditWallet } from "@/lib/billing/wallet";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Fail closed: Webhook verification required in all environments
    if (!secret) {
      console.error("[Billing Webhook] RAZORPAY_WEBHOOK_SECRET is not configured on server. Rejecting.");
      return NextResponse.json({ error: "Webhook verification not configured" }, { status: 500 });
    }
    if (!signature) {
      return NextResponse.json({ error: "Missing webhook signature" }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.warn("[Billing Webhook] Invalid webhook signature detected.");
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);

    if (payload.event !== "payment.captured") {
      return NextResponse.json({ received: true, ignored_event: payload.event });
    }

    const payment = payload.payload?.payment?.entity;
    if (!payment) {
      return NextResponse.json({ error: "Missing payment entity" }, { status: 400 });
    }

    const paymentId = payment.id;
    const orderId = payment.order_id;
    const totalPaise = payment.amount;
    const notesOrgId = payment.notes?.organization_id;

    if (!paymentId) {
      console.error("[Billing Webhook] Missing payment_id in payment payload");
      return NextResponse.json({ error: "Invalid payment payload" }, { status: 400 });
    }

    const currency = (payment.currency || "INR").toUpperCase();
    if (currency !== "INR") {
      console.error(`[Billing Webhook] Currency mismatch: Received ${currency}, expected INR`);
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    // Verify order exists in database and bind tenant securely from verified order record
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminSupabase = createAdminClient();

    let organizationId = notesOrgId;
    let expectedTotalPaise = totalPaise;

    if (orderId) {
      const { data: pendingOrder, error: orderErr } = await adminSupabase
        .schema("billing")
        .from("wallet_transactions")
        .select("id, organization_id, amount_paise, gst_amount_paise, status, metadata")
        .eq("razorpay_order_id", orderId)
        .maybeSingle();

      if (pendingOrder) {
        // Derive authoritative tenant from verified order record
        organizationId = pendingOrder.organization_id;
        expectedTotalPaise = pendingOrder.metadata?.expected_total_paise || (pendingOrder.amount_paise + (pendingOrder.gst_amount_paise || 0));

        // Exact amount matching required: reject any divergence
        if (totalPaise !== expectedTotalPaise) {
          console.error(`[Billing Webhook] Amount tampering alert: Received ${totalPaise} paise, expected exact ${expectedTotalPaise} paise`);
          await adminSupabase.from("operational_events").insert({
            organization_id: organizationId,
            event_source: "billing_webhook",
            severity: "critical",
            error_code: "PAYMENT_AMOUNT_MISMATCH",
            safe_message: `Captured payment (${totalPaise} paise) does not match order (${expectedTotalPaise} paise)`,
            metadata: { payment_id: paymentId, order_id: orderId, total_paise: totalPaise, expected: expectedTotalPaise }
          });
          return NextResponse.json({ error: "Payment amount does not match order" }, { status: 400 });
        }
      } else {
        const isMockAllowed = process.env.ALLOW_MOCK_PAYMENTS === "true" && process.env.NODE_ENV !== "production";
        if (!isMockAllowed) {
          console.error(`[Billing Webhook] Received webhook for unverified order ID: ${orderId}`);
          await adminSupabase.from("operational_events").insert({
            event_source: "billing_webhook",
            severity: "critical",
            error_code: "UNKNOWN_PAYMENT_ORDER",
            safe_message: `Attempted wallet credit for unknown order ${orderId}`,
            metadata: { payment_id: paymentId, order_id: orderId, amount: totalPaise, notes_org_id: notesOrgId }
          });
          return NextResponse.json({ error: "Order not registered or unverified" }, { status: 400 });
        }
      }
    }

    if (!organizationId) {
      console.error("[Billing Webhook] Could not determine tenant organization for payment:", paymentId);
      return NextResponse.json({ error: "Unmapped tenant organization" }, { status: 400 });
    }

    // Amount credited to wallet is base operational amount before 18% GST
    // Total = Base * 1.18 => Base = Total / 1.18
    const basePaise = Math.round(totalPaise / 1.18);
    const gstPaise = totalPaise - basePaise;

    const creditResult = await creditWallet(
      organizationId,
      basePaise,
      paymentId,
      orderId,
      gstPaise,
      {
        razorpay_payment_id: paymentId,
        razorpay_order_id: orderId,
        method: payment.method,
        email: payment.email,
        contact: payment.contact,
        raw_amount_paise: totalPaise,
      }
    );

    console.log(
      `[Billing Webhook] Wallet credit processed for org ${organizationId}: ` +
      `credited=₹${basePaise / 100}, new_balance=₹${creditResult.balanceInr}, idempotent=${creditResult.alreadyProcessed}`
    );

    return NextResponse.json({
      success: true,
      credited: !creditResult.alreadyProcessed,
      balance_inr: creditResult.balanceInr,
      organization_id: organizationId,
    });

  } catch (error: any) {
    console.error("[Billing Webhook] Webhook processing exception:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
