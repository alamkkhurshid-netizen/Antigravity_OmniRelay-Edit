import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { evaluateProductStock } from "@/lib/retail/catalog";

export async function GET(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    if (!organization) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("category_id");
    const lowStockOnly = searchParams.get("low_stock") === "true";
    const search = searchParams.get("q");

    let query = supabase
      .from("retail_products")
      .select("*, retail_categories(id, name, slug)")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false });

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,sku.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: products, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let result = products || [];

    if (lowStockOnly) {
      result = result.filter((p) => {
        const { isLowStock, isOutOfStock } = evaluateProductStock(p);
        return isLowStock || isOutOfStock;
      });
    }

    return NextResponse.json({ products: result });
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
    const {
      sku,
      title,
      description,
      price,
      currency = "INR",
      category_id,
      image_link,
      images = [],
      brand,
      inventory_count = 0,
      variants = [],
      low_stock_threshold = 5,
      availability = "in stock",
      condition = "new",
      tags = [],
    } = body;

    if (!sku || !title || price === undefined) {
      return NextResponse.json({ error: "Missing required fields: sku, title, price" }, { status: 400 });
    }

    const link = body.link || `/${organization.id}/store?sku=${encodeURIComponent(sku)}`;

    const { data: newProduct, error } = await supabase
      .from("retail_products")
      .insert({
        organization_id: organization.id,
        sku,
        title,
        description: description || null,
        price: Number(price),
        currency,
        category_id: category_id || null,
        link,
        image_link: image_link || (images[0] || ""),
        images,
        brand: brand || null,
        inventory_count: Number(inventory_count),
        variants,
        low_stock_threshold: Number(low_stock_threshold),
        availability,
        condition,
        tags,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ product: newProduct }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    if (!organization) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Product id is required" }, { status: 400 });
    }

    if (updates.price !== undefined) updates.price = Number(updates.price);
    if (updates.inventory_count !== undefined) updates.inventory_count = Number(updates.inventory_count);
    if (updates.low_stock_threshold !== undefined) updates.low_stock_threshold = Number(updates.low_stock_threshold);

    const { data: updated, error } = await supabase
      .from("retail_products")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", organization.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ product: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    if (!organization) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Product id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("retail_products")
      .delete()
      .eq("id", id)
      .eq("organization_id", organization.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
