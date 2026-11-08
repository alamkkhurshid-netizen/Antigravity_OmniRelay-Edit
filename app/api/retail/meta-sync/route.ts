import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { buildMetaCatalogBatchPayload, RetailProduct } from "@/lib/retail/catalog";

export async function POST(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    if (!organization) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const orgExtra = (organization.extra || {}) as Record<string, unknown>;
    const catalogId = (body.catalog_id as string) || (orgExtra.meta_catalog_id as string | undefined);
    const accessToken = (body.access_token as string) || process.env.META_ACCESS_TOKEN;

    // Fetch all active products
    const { data: products, error } = await supabase
      .from("retail_products")
      .select("*")
      .eq("organization_id", organization.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const productList = (products || []) as RetailProduct[];
    const batchPayload = buildMetaCatalogBatchPayload(productList);

    // If Meta Catalog ID and Access Token are available, sync directly via Meta Graph API v21.0
    if (catalogId && accessToken) {
      const metaUrl = `https://graph.facebook.com/v21.0/${catalogId}/batch?access_token=${accessToken}`;
      const res = await fetch(metaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batchPayload),
      });

      const metaRes = await res.json();
      return NextResponse.json({
        success: res.ok,
        synced_count: productList.length,
        meta_response: metaRes,
      });
    }

    // In testing or without direct catalog ID, return the formatted feed batch
    return NextResponse.json({
      success: true,
      synced_count: productList.length,
      mode: "payload_generated",
      feed_url: `/api/retail/catalog?org_id=${organization.id}`,
      batch_payload: batchPayload,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
