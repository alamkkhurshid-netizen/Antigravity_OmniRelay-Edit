import { NextResponse } from "next/server";
import crypto from "crypto";
import { creditWallet } from "@/lib/billing/wallet";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (process.env.NODE_ENV === "production" && secret) {
      if (!signature) {
        return NextResponse.json({ error: "Missing webhook signature" }, { status: 400 });
      }
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");

      if (expectedSignature !== signature) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
      }
    }

    const payload = JSON.parse(rawBody);

    if (payload.event !== "payment.captured") {
      return NextResponse.json({ received: true, ignored_event: payload.event });
    }

    const payment = payload.payload?.payment?.entity;
    if (!payment) {
      return NextResponse.json({ error: "Missing payment entity" }, { status: 400 });
    }

    const organizationId = payment.notes?.organization_id;
    const paymentId = payment.id;
    const orderId = payment.order_id;
    const totalPaise = payment.amount;

    if (!organizationId || !paymentId) {
      console.error("[Billing Webhook] Missing organization_id or payment_id in payment notes");
      return NextResponse.json({ error: "Invalid payment payload" }, { status: 400 });
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
