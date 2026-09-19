import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

// Create an admin client because this route is accessed anonymously by Meta
export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");

  if (!orgId) {
    return new NextResponse("Missing org_id", { status: 400 });
  }

  // Fetch all active products for the organization
  const { data: products, error } = await supabase
    .from("retail_catalog")
    .select("*")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  if (error) {
    console.error("Failed to fetch catalog:", error);
    return new NextResponse("Database error", { status: 500 });
  }

  // Generate Facebook RSS/XML Feed format
  const xml = `<?xml version="1.0"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>OmniRelay Dynamic Catalog</title>
    <link>https://omnirelay.io</link>
    <description>Auto-generated feed from OmniRelay Retail</description>
    ${products?.map(p => `
    <item>
      <g:id>${p.id}</g:id>
      <g:title>${escapeXml(p.name)}</g:title>
      <g:description>${escapeXml(p.description || p.name)}</g:description>
      <g:link>https://omnirelay.io/product/${p.id}</g:link>
      <g:image_link>${p.image_url || "https://omnirelay.io/placeholder.png"}</g:image_link>
      <g:brand>OmniRelay Brand</g:brand>
      <g:condition>new</g:condition>
      <g:availability>${p.stock_quantity > 0 ? 'in stock' : 'out of stock'}</g:availability>
      <g:price>${p.price} INR</g:price>
      <g:item_group_id>${p.category_id || 'all'}</g:item_group_id>
    </item>`).join("")}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}

function escapeXml(unsafe: string) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
