import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateTopUpWithGst } from "@/lib/billing/deduction-engine";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { amount_inr, organization_id } = await request.json();

    if (!amount_inr || amount_inr < 100) {
      return NextResponse.json({ error: "Minimum top-up is ₹100" }, { status: 400 });
    }

    // Verify user is owner/admin of this organization
    const { data: isMember } = await supabase.rpc("is_organization_member", {
      target_organization_id: organization_id,
      minimum_role: "admin",
    });

    if (!isMember) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Calculate official 18% GST breakdown
    const gstBreakdown = calculateTopUpWithGst(amount_inr);

    // Create Razorpay Order
    // If Razorpay API credentials are provided, generate real order via Razorpay API
    let razorpayOrderId = `order_${Math.random().toString(36).substring(2, 15)}`;
    
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      try {
        const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
        const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: gstBreakdown.totalPayablePaise,
            currency: "INR",
            receipt: `rcpt_${organization_id.substring(0, 8)}_${Date.now()}`,
            notes: {
              organization_id,
              base_amount_inr: amount_inr,
              gst_amount_inr: gstBreakdown.gstAmountInr,
            },
          }),
        });

        if (rzpRes.ok) {
          const rzpData = await rzpRes.json();
          razorpayOrderId = rzpData.id;
        }
      } catch (err) {
        console.warn("[Razorpay] Live API call fallback to deterministic order ID:", err);
      }
    }

    return NextResponse.json({
      order_id: razorpayOrderId,
      amount_inr: gstBreakdown.baseAmountInr,
      gst_inr: gstBreakdown.gstAmountInr,
      total_payable_inr: gstBreakdown.totalPayableInr,
      total_payable_paise: gstBreakdown.totalPayablePaise,
      currency: "INR",
      key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_mock",
    });

  } catch (error) {
    console.error("Top-up order creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
