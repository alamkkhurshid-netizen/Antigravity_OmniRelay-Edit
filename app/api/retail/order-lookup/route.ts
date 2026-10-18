import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildWhatsAppOrderStatusCard,
} from "@/lib/retail/whatsapp-catalog";
import { RetailOrder, extractOrderLookupQuery } from "@/lib/retail/orders";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || searchParams.get("order_id");
    const organizationId = searchParams.get("organization_id");

    if (!query) {
      return NextResponse.json({ error: "Search query or order_id is required" }, { status: 400 });
    }

    const orderIdMatch = extractOrderLookupQuery(query) || query.trim();
    const admin = createAdminClient();

    let dbQuery = admin
      .from("retail_orders")
      .select("*, retail_order_items(*)")
      .order("created_at", { ascending: false });

    if (organizationId) {
      dbQuery = dbQuery.eq("organization_id", organizationId);
    }

    // Match either full UUID or 8-character prefix or tracking number
    if (orderIdMatch.length === 36) {
      dbQuery = dbQuery.eq("id", orderIdMatch);
    } else {
      dbQuery = dbQuery.or(`id.ilike.${orderIdMatch}%,tracking_number.ilike.%${orderIdMatch}%`);
    }

    const { data: orders, error } = await dbQuery.limit(1);

    if (error || !orders || orders.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orders[0] as RetailOrder;
    const whatsappMessage = buildWhatsAppOrderStatusCard(order);

    return NextResponse.json({
      order,
      whatsapp_message: whatsappMessage,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
