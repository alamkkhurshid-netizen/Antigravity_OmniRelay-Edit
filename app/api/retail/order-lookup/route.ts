import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildWhatsAppOrderStatusCard,
} from "@/lib/retail/whatsapp-catalog";
import { RetailOrder, extractOrderLookupQuery } from "@/lib/retail/orders";
import { isFeatureEnabledAsync } from "@/lib/feature-flags";
import { verifySignedOrderToken, checkOrderLookupRateLimitAsync } from "@/lib/retail/order-auth";

export interface RestrictedOrderProjection {
  id: string;
  order_short_id: string;
  status: string;
  payment_status: string;
  total_amount: number;
  created_at: string;
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  item_count: number;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || searchParams.get("order_id");
    const organizationId = searchParams.get("organization_id");
    const customerPhone = searchParams.get("phone")?.replace(/\D/g, "");
    const orderToken = searchParams.get("token");
    const otp = searchParams.get("otp");

    // 1. Mandatory organization binding
    if (!organizationId) {
      return NextResponse.json(
        { error: "organization_id parameter is required for order lookup" },
        { status: 400 }
      );
    }

    // 2. Durable Sliding-Window Rate Limiting to Prevent Enumeration
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
    const rateLimit = await checkOrderLookupRateLimitAsync(`${organizationId}:${ip}`, 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many lookup attempts. Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    // 3. PostgreSQL-backed Feature flag check
    const isRetailEnabled = await isFeatureEnabledAsync("whatsapp_catalog_enabled", organizationId);
    if (!isRetailEnabled) {
      return NextResponse.json(
        { error: "Retail ordering module is currently disabled" },
        { status: 403 }
      );
    }

    if (!query) {
      return NextResponse.json({ error: "Search query or order_id is required" }, { status: 400 });
    }

    const orderIdMatch = extractOrderLookupQuery(query) || query.trim();
    if (orderIdMatch.length < 6) {
      return NextResponse.json(
        { error: "Order query must contain at least 6 characters to prevent enumeration" },
        { status: 400 }
      );
    }

    // 4. Determine if caller is an authenticated staff member
    let isStaffAuthenticated = false;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: agent } = await supabase
          .from("agents")
          .select("organization_id")
          .eq("user_id", user.id)
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (agent) {
          isStaffAuthenticated = true;
        }
      }
    } catch {
      // In non-browser / service context, proceed to token/phone check
    }

    // 5. Query order from database scoped strictly to organization_id
    const admin = createAdminClient();
    let dbQuery = admin
      .from("retail_orders")
      .select("*, retail_order_items(*)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (orderIdMatch.length === 36) {
      dbQuery = dbQuery.eq("id", orderIdMatch);
    } else {
      dbQuery = dbQuery.or(`id.ilike.${orderIdMatch}%,tracking_number.eq.${orderIdMatch}`);
    }

    const { data: orders, error } = await dbQuery.limit(1);

    if (error || !orders || orders.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orders[0] as RetailOrder;

    // 6. Strict Cryptographic & Customer Verification
    let isAuthorized = isStaffAuthenticated;

    // A. Cryptographically HMAC-Signed Token Verification
    if (!isAuthorized && orderToken) {
      isAuthorized = verifySignedOrderToken(orderToken, order.id, organizationId);
    }

    // B. Full Phone Verification (strictly requires full 10+ digit match, never last-4 digits alone)
    if (!isAuthorized && customerPhone) {
      const orderPhoneNormalized = (order.customer_phone || "").replace(/\D/g, "");
      if (
        customerPhone.length >= 10 &&
        orderPhoneNormalized.length >= 10 &&
        (customerPhone === orderPhoneNormalized ||
          (customerPhone.length === 10 && orderPhoneNormalized.endsWith(customerPhone)))
      ) {
        isAuthorized = true;
      }
    }

    // C. OTP Verification (if provided)
    if (!isAuthorized && otp && (order as unknown as Record<string, unknown>).otp_code === otp) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return NextResponse.json(
        {
          error: "Verification required: valid HMAC-signed order token or full registered customer phone match is required to view order status",
        },
        { status: 401 }
      );
    }


    // 6. Return restricted status projection (Zero-PII disclosure)
    const restrictedProjection: RestrictedOrderProjection = {
      id: order.id,
      order_short_id: order.id.slice(0, 8).toUpperCase(),
      status: order.status,
      payment_status: order.payment_status,
      total_amount: order.total_amount,
      created_at: order.created_at,
      carrier: order.carrier || null,
      tracking_number: order.tracking_number || null,
      tracking_url: order.tracking_url || null,
      item_count: order.items?.length || 0,
    };

    const whatsappMessage = buildWhatsAppOrderStatusCard(order);

    return NextResponse.json({
      order: restrictedProjection,
      whatsapp_message: whatsappMessage,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

