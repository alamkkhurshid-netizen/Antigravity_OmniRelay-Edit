import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Mock Razorpay Order Creation for Phase 1
    // (In production, use the official razorpay-node SDK)
    const mockRazorpayOrderId = "order_" + Math.random().toString(36).substring(2, 15);
    
    // We would normally return the order ID to the client to initialize Razorpay checkout.
    return NextResponse.json({
      order_id: mockRazorpayOrderId,
      amount_paise: amount_inr * 100,
      currency: "INR",
      key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_mock",
    });

  } catch (error) {
    console.error("Top-up error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
