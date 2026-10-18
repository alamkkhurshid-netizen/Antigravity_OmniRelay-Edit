import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isFeatureEnabledAsync } from "@/lib/feature-flags";

// Retail catalog feed requires feed secret token or internal service authentication
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new NextResponse("Server configuration missing", { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");

    if (!orgId) {
      return new NextResponse("Missing org_id parameter", { status: 400 });
    }

    // 1. PostgreSQL-backed feature flag gating
    if (!(await isFeatureEnabledAsync("whatsapp_catalog_enabled", orgId))) {
      return new NextResponse("Retail catalog feature is disabled for this organization", { status: 403 });
    }

    // 2. Feed secret authentication
    const feedSecret = searchParams.get("secret") || req.headers.get("x-feed-secret");
    const authHeader = req.headers.get("authorization");
    const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const providedSecret = feedSecret || bearerSecret;

    const expectedSecret = process.env.RETAIL_CATALOG_FEED_SECRET || process.env.INTERNAL_SERVICE_KEY;

    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      return new NextResponse("Unauthorized: valid catalog feed secret is required", { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all products for this organization
    const { data: products, error } = await supabase
      .from("retail_products")
      .select("*")
      .eq("organization_id", orgId);

    if (error) {
      console.error("Supabase Error:", error);
      return new NextResponse("Failed to fetch products", { status: 500 });
    }

    // Generate CSV for Facebook Catalog
    // Required fields: id, title, description, availability, condition, price, link, image_link, brand
    const headers = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "inventory"];
    
    // Helper to safely escape CSV fields
    const escapeCsv = (field: unknown) => {
      if (field === null || field === undefined) return "";
      const str = String(field).replace(/"/g, '""'); // Escape double quotes
      if (str.search(/("|,|\n)/g) >= 0) {
        return `"${str}"`;
      }
      return str;
    };

    interface CatalogItemRow {
      sku: string;
      title: string;
      description?: string | null;
      availability: string;
      condition: string;
      price: number | string;
      currency: string;
      link: string;
      image_link: string;
      brand?: string | null;
      inventory_count: number;
    }

    const csvRows = ((products || []) as unknown as CatalogItemRow[]).map((p) => {
      return [
        p.sku, // Facebook uses 'id' which maps to our SKU
        p.title,
        p.description || "",
        p.availability,
        p.condition,

        `${p.price} ${p.currency}`, // Format: 9.99 USD
        p.link,
        p.image_link,
        p.brand || "",
        p.inventory_count,
      ].map(escapeCsv).join(",");
    });

    const csvContent = [headers.join(","), ...csvRows].join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="catalog-${orgId}.csv"`,
      },
    });

  } catch (error: unknown) {
    console.error("Catalog API Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
