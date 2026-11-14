import { NextResponse } from "next/server";
import crypto from "crypto";
import { creditWallet } from "@/lib/billing/wallet";
import { verifyCashfreeWebhookSignature } from "@/lib/billing/cashfree";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const rzpSignature = request.headers.get("x-razorpay-signature");
    const cfSignature = request.headers.get("x-webhook-signature");
    const cfTimestamp = request.headers.get("x-webhook-timestamp");

    let isCashfree = false;
    let isRazorpay = false;

    // 1. Authenticate signature according to gateway format
    if (cfSignature) {
      if (!verifyCashfreeWebhookSignature(rawBody, cfTimestamp, cfSignature)) {
        console.warn("[Billing Webhook] Invalid Cashfree webhook signature detected.");
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
      }
      isCashfree = true;
    } else if (rzpSignature) {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!secret) {
        console.error("[Billing Webhook] RAZORPAY_WEBHOOK_SECRET is not configured on server.");
        return NextResponse.json({ error: "Webhook verification not configured" }, { status: 500 });
      }
      const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
      const sigBuf = Buffer.from(rzpSignature);
      const expBuf = Buffer.from(expectedSignature);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        console.warn("[Billing Webhook] Invalid Razorpay webhook signature detected.");
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
      }
      isRazorpay = true;
    } else {
      return NextResponse.json({ error: "Missing webhook signature" }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminSupabase = createAdminClient();

    let paymentId = "";
    let orderId = "";
    let totalPaise = 0;
    let notesOrgId: string | undefined = undefined;

    // --- CASE A: CASHFREE WEBHOOK ---
    if (isCashfree) {
      const type = payload.type || payload.event;
      if (type !== "PAYMENT_SUCCESS_WEBHOOK" && type !== "payment.success") {
        return NextResponse.json({ received: true, ignored_type: type });
      }
      const orderData = payload.data?.order || {};
      const paymentData = payload.data?.payment || {};

      orderId = String(orderData.order_id || "");
      paymentId = String(paymentData.cf_payment_id || orderData.cf_order_id || orderId);
      const amountInr = Number(orderData.order_amount ?? paymentData.payment_amount ?? 0);
      totalPaise = Math.round(amountInr * 100);
      notesOrgId = orderData.order_tags?.organization_id;
    }

    // --- CASE B: RAZORPAY WEBHOOK ---
    if (isRazorpay) {
      if (payload.event !== "payment.captured") {
        return NextResponse.json({ received: true, ignored_event: payload.event });
      }
      const payment = payload.payload?.payment?.entity;
      if (!payment) return NextResponse.json({ error: "Missing payment entity" }, { status: 400 });

      paymentId = payment.id;
      orderId = payment.order_id;
      totalPaise = payment.amount;
      notesOrgId = payment.notes?.organization_id;

      const currency = (payment.currency || "INR").toUpperCase();
      if (currency !== "INR") {
        console.error(`[Billing Webhook] Currency mismatch: Received ${currency}, expected INR`);
        return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
      }
    }

    if (!paymentId) {
      return NextResponse.json({ error: "Missing payment identifier" }, { status: 400 });
    }

    // Check if this payment is for a SaaS Subscription (saas_billing_orders)
    const { data: saasOrder } = await adminSupabase
      .from("saas_billing_orders")
      .select("id, organization_id, amount_paise, status")
      .eq("provider_order_id", orderId)
      .maybeSingle();

    if (saasOrder) {
      const { data: activation, error: actError } = await adminSupabase.rpc("activate_saas_subscription", {
        p_provider_order_id: orderId,
        p_provider_payment_id: paymentId,
      });
      if (actError) {
        console.error("[Billing Webhook] SaaS activation failed:", actError);
        return NextResponse.json({ error: actError.message }, { status: 400 });
      }
      return NextResponse.json({ success: true, saas_subscription: activation });
    }

    // Otherwise, check if this payment is for Wallet Top-up (wallet_transactions)
    let organizationId = notesOrgId;
    let expectedTotalPaise = totalPaise;

    if (orderId) {
      const { data: pendingOrder } = await adminSupabase
        .schema("billing")
        .from("wallet_transactions")
        .select("id, organization_id, amount_paise, gst_amount_paise, status, metadata")
        .eq("razorpay_order_id", orderId)
        .maybeSingle();

      if (pendingOrder) {
        organizationId = pendingOrder.organization_id;
        expectedTotalPaise = pendingOrder.metadata?.expected_total_paise || (pendingOrder.amount_paise + (pendingOrder.gst_amount_paise || 0));

        if (totalPaise !== expectedTotalPaise) {
          console.error(`[Billing Webhook] Amount tampering alert: Received ${totalPaise} paise, expected ${expectedTotalPaise} paise`);
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
    const basePaise = Math.round(totalPaise / 1.18);
    const gstPaise = totalPaise - basePaise;

    const creditResult = await creditWallet(
      organizationId,
      basePaise,
      paymentId,
      orderId,
      gstPaise,
      {
        provider_payment_id: paymentId,
        provider_order_id: orderId,
        gateway: isCashfree ? "cashfree" : "razorpay",
        raw_amount_paise: totalPaise,
      }
    );

    const invoiceNumber = `INV-${new Date().getFullYear()}-${paymentId.slice(-8).toUpperCase()}`;

    if (creditResult.transactionId) {
      await adminSupabase
        .schema("billing")
        .from("wallet_transactions")
        .update({
          invoice_number: invoiceNumber,
          status: "completed",
        })
        .eq("id", creditResult.transactionId);
    }

    return NextResponse.json({
      success: true,
      credited: !creditResult.alreadyProcessed,
      balance_inr: creditResult.balanceInr,
      organization_id: organizationId,
      invoice_number: invoiceNumber,
      invoice_url: `/api/billing/invoices/${creditResult.transactionId || invoiceNumber}`,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("[Billing Webhook] Webhook processing exception:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
