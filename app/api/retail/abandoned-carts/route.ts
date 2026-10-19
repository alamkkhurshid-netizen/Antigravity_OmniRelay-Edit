import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import {
  isEligibleForRecoveryNudge,
  buildAbandonedCartRecoveryMessage,
  AbandonedCart,
} from "@/lib/retail/abandoned-cart";

export async function GET() {
  try {
    const { supabase, organization } = await getWorkspace();
    if (!organization) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: carts, error } = await supabase
      .from("retail_abandoned_carts")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const analyzedCarts = (carts || []).map((cart) => ({
      ...cart,
      is_eligible_for_nudge: isEligibleForRecoveryNudge(cart as AbandonedCart),
    }));

    return NextResponse.json({ carts: analyzedCarts });
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

    // Trigger recovery nudge action
    if (body.action === "send_nudge") {
      const { cart_id } = body;
      if (!cart_id) {
        return NextResponse.json({ error: "cart_id is required" }, { status: 400 });
      }

      const { data: cart, error: cartErr } = await supabase
        .from("retail_abandoned_carts")
        .select("*")
        .eq("id", cart_id)
        .eq("organization_id", organization.id)
        .single();

      if (cartErr || !cart) {
        return NextResponse.json({ error: "Cart not found" }, { status: 404 });
      }

      const typedCart = cart as AbandonedCart;
      if (!isEligibleForRecoveryNudge(typedCart)) {
        return NextResponse.json(
          { error: "Cart is not eligible for a recovery nudge (already sent or recovered)" },
          { status: 400 }
        );
      }

      const storeUrl = `https://${organization.id}.omnirelay.com/store`;
      const recoveryMessage = buildAbandonedCartRecoveryMessage(typedCart, storeUrl);

      // Stamp recovery_sent_at to guarantee exactly one nudge is sent
      const { data: updated, error: stampErr } = await supabase
        .from("retail_abandoned_carts")
        .update({ recovery_sent_at: new Date().toISOString() })
        .eq("id", cart_id)
        .select()
        .single();

      if (stampErr) {
        return NextResponse.json({ error: stampErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: recoveryMessage,
        cart: updated,
      });
    }

    // Record or update an abandoned cart
    const { customer_phone, customer_name, cart_items = [], cart_value = 0 } = body;
    if (!customer_phone) {
      return NextResponse.json({ error: "customer_phone is required" }, { status: 400 });
    }

    const { data: saved, error } = await supabase
      .from("retail_abandoned_carts")
      .insert({
        organization_id: organization.id,
        customer_phone,
        customer_name: customer_name || null,
        cart_items,
        cart_value: Number(cart_value),
        recovered: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ cart: saved }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
