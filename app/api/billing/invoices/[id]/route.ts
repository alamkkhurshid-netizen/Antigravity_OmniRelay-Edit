import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildGstInvoiceData, renderInvoiceHtml } from "@/lib/billing/invoice";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Find transaction in billing.wallet_transactions
    let tx = null;
    if (id === "latest") {
      const { getWorkspace } = await import("@/lib/workspace");
      const { organization } = await getWorkspace().catch(() => ({ organization: null }));
      if (organization) {
        const { data: latestTx } = await admin
          .schema("billing")
          .from("wallet_transactions")
          .select("id, organization_id, amount_paise, gst_amount_paise, razorpay_payment_id, razorpay_order_id, invoice_number, status, created_at, metadata")
          .eq("organization_id", organization.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        tx = latestTx;
      }
    } else {
      const { data: foundTx } = await admin
        .schema("billing")
        .from("wallet_transactions")
        .select("id, organization_id, amount_paise, gst_amount_paise, razorpay_payment_id, razorpay_order_id, invoice_number, status, created_at, metadata")
        .or(`id.eq.${id},invoice_number.eq.${id},razorpay_order_id.eq.${id},razorpay_payment_id.eq.${id}`)
        .maybeSingle();
      tx = foundTx;
    }

    if (!tx) {
      return NextResponse.json({ error: "No completed invoice found" }, { status: 404 });
    }

    // Verify user authorization: member of tenant or platform operator
    const { data: isOperator } = await supabase.rpc("is_oem_operator");
    const { data: isMember } = await supabase.rpc("is_organization_member", {
      target_organization_id: tx.organization_id,
      minimum_role: "member",
    });

    if (!isOperator && !isMember) {
      return NextResponse.json({ error: "Forbidden: You do not have access to this invoice" }, { status: 403 });
    }

    // Fetch organization info for recipient details
    const { data: org } = await admin
      .from("organizations")
      .select("id, name, extra")
      .eq("id", tx.organization_id)
      .single();

    const extra = (org?.extra || {}) as Record<string, unknown>;
    const billingMeta = (extra.billing || {}) as Record<string, string>;

    const invoiceData = buildGstInvoiceData({
      invoiceNumber: tx.invoice_number || `INV-${new Date(tx.created_at).getFullYear()}-${(tx.razorpay_payment_id || tx.id).slice(-8).toUpperCase()}`,
      organizationId: tx.organization_id,
      organizationName: org?.name || "Demo Clinic",
      amountPaise: tx.amount_paise,
      gstAmountPaise: tx.gst_amount_paise,
      razorpayPaymentId: tx.razorpay_payment_id || tx.id,
      razorpayOrderId: tx.razorpay_order_id,
      customerStateCode: billingMeta.state_code || "29",
      customerGstin: billingMeta.gstin,
      customerAddress: billingMeta.address,
      issuedAt: new Date(tx.created_at).toISOString().split("T")[0],
    });

    const url = new URL(request.url);
    if (url.searchParams.get("format") === "json") {
      return NextResponse.json({ invoice: invoiceData });
    }

    const html = renderInvoiceHtml(invoiceData);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
