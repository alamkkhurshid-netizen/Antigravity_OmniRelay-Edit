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
    let razorpayOrderId = "";
    
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
        } else {
          const errText = await rzpRes.text();
          console.error("[Razorpay] API order creation failed:", errText);
          return NextResponse.json({ error: "Failed to create payment order with provider" }, { status: 502 });
        }
      } catch (err: any) {
        console.error("[Razorpay] Network exception during order creation:", err);
        return NextResponse.json({ error: "Payment gateway network error" }, { status: 502 });
      }
    } else {
      // In development/test mode only, if explicit mock testing is enabled
      if (process.env.ALLOW_MOCK_PAYMENTS === "true" && process.env.NODE_ENV !== "production") {
        razorpayOrderId = `order_test_${Math.random().toString(36).substring(2, 15)}`;
      } else {
        return NextResponse.json({ error: "Payment gateway credentials are not configured" }, { status: 500 });
      }
    }

    // Persist pre-registered order to prevent untracked webhook credits (fail closed on failure)
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminSupabase = createAdminClient();
    const { error: insertError } = await adminSupabase.schema("billing").from("wallet_transactions").insert({
      organization_id,
      amount_paise: gstBreakdown.baseAmountInr * 100,
      gst_amount_paise: gstBreakdown.gstAmountInr * 100,
      transaction_type: "top_up",
      razorpay_order_id: razorpayOrderId,
      status: "pending",
      metadata: {
        expected_total_paise: gstBreakdown.totalPayablePaise,
        base_amount_inr: amount_inr,
        created_by_user_id: user.id,
        currency: "INR",
      },
    });

    if (insertError) {
      console.error("[Razorpay Top-up] Failed to pre-register pending transaction row:", insertError);
      return NextResponse.json({ error: "Failed to initialize payment order in ledger" }, { status: 500 });
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
