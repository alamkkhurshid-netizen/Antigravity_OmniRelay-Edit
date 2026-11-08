import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import {
  isValidStatusTransition,
  appendOrderTimeline,
  buildWhatsAppOrderMessage,
  RetailOrderStatus,
  OrderTimelineEvent,
} from "@/lib/retail/orders";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, organization } = await getWorkspace();
    if (!organization) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: order, error } = await supabase
      .from("retail_orders")
      .select("*, retail_order_items(*)")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, organization } = await getWorkspace();
    if (!organization) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { status, carrier, tracking_number, tracking_url, notes, payment_status } = body;

    // Fetch existing order to check transition and append timeline
    const { data: existing, error: fetchErr } = await supabase
      .from("retail_orders")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (status && status !== existing.status) {
      const nextStatus = status as RetailOrderStatus;
      if (!isValidStatusTransition(existing.status as RetailOrderStatus, nextStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status transition from '${existing.status}' to '${nextStatus}'`,
          },
          { status: 400 }
        );
      }

      updateData.status = nextStatus;
      const currentTimeline = (existing.timeline || []) as OrderTimelineEvent[];
      updateData.timeline = appendOrderTimeline(
        currentTimeline,
        nextStatus,
        notes || undefined,
        "operator"
      );

      // S7-07: WhatsApp notification trigger for key stages
      if (nextStatus === "confirmed" || nextStatus === "shipped" || nextStatus === "delivered") {
        const notification = buildWhatsAppOrderMessage(
          {
            id: existing.id,
            customer_name: existing.customer_name,
            total_amount: existing.total_amount,
            carrier: carrier || existing.carrier,
            tracking_number: tracking_number || existing.tracking_number,
            tracking_url: tracking_url || existing.tracking_url,
          },
          nextStatus
        );

        // Store notification record for dispatch
        updateData.last_notification = {
          stage: nextStatus,
          timestamp: new Date().toISOString(),
          content: notification,
        };
      }
    }

    if (carrier !== undefined) updateData.carrier = carrier;
    if (tracking_number !== undefined) updateData.tracking_number = tracking_number;
    if (tracking_url !== undefined) updateData.tracking_url = tracking_url;
    if (notes !== undefined) updateData.notes = notes;
    if (payment_status !== undefined) updateData.payment_status = payment_status;

    const { data: updated, error: updateErr } = await supabase
      .from("retail_orders")
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", organization.id)
      .select("*, retail_order_items(*)")
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ order: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
