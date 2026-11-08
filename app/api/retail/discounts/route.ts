import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { calculateDiscount, RetailDiscount } from "@/lib/retail/discounts";

export async function GET() {
  try {
    const { supabase, organization } = await getWorkspace();
    if (!organization) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: discounts, error } = await supabase
      .from("retail_discounts")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ discounts: discounts || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    if (!organization) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Check if validating/applying a discount code on an order
    if (body.action === "apply") {
      const { code, subtotal } = body;
      if (!code || subtotal === undefined) {
        return NextResponse.json({ error: "Code and subtotal are required" }, { status: 400 });
      }

      const { data: discount, error } = await supabase
        .from("retail_discounts")
        .select("*")
        .eq("organization_id", organization.id)
        .ilike("code", code.trim())
        .single();

      if (error || !discount) {
        return NextResponse.json({
          valid: false,
          discountAmount: 0,
          finalAmount: Number(subtotal),
          reason: "Invalid discount code",
        });
      }

      const result = calculateDiscount(discount as RetailDiscount, Number(subtotal));
      return NextResponse.json(result);
    }

    // Otherwise, create a new discount rule
    const {
      code,
      description,
      discount_type = "percentage",
      value,
      min_order_amount = 0,
      max_discount_amount,
      usage_limit,
      expires_at,
    } = body;

    if (!code || value === undefined) {
      return NextResponse.json({ error: "Code and value are required" }, { status: 400 });
    }

    const { data: created, error } = await supabase
      .from("retail_discounts")
      .insert({
        organization_id: organization.id,
        code: code.trim().toUpperCase(),
        description: description || null,
        discount_type,
        value: Number(value),
        min_order_amount: Number(min_order_amount),
        max_discount_amount: max_discount_amount ? Number(max_discount_amount) : null,
        usage_limit: usage_limit ? Number(usage_limit) : null,
        expires_at: expires_at || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ discount: created }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
