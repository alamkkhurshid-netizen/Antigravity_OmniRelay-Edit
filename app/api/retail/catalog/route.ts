import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// We use the service role key here to allow external platforms (like Facebook) to pull the feed
// without needing user authentication. Instead, we use an API token query param or just organization_id.
// Note: In production, consider adding a feed-specific secret token.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new NextResponse("Server configuration missing", { status: 500 });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");

    if (!orgId) {
      return new NextResponse("Missing org_id parameter", { status: 400 });
    }

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
    const escapeCsv = (field: any) => {
      if (field === null || field === undefined) return "";
      const str = String(field).replace(/"/g, '""'); // Escape double quotes
      if (str.search(/("|,|\n)/g) >= 0) {
        return `"${str}"`;
      }
      return str;
    };

    const csvRows = products.map((p) => {
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

  } catch (error: any) {
    console.error("Catalog API Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
