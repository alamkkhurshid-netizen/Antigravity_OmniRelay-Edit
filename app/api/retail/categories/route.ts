import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { slugifyCategory } from "@/lib/retail/catalog";

export async function GET() {
  try {
    const { supabase, organization } = await getWorkspace();
    if (!organization) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: categories, error } = await supabase
      .from("retail_categories")
      .select("*")
      .eq("organization_id", organization.id)
      .order("display_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ categories: categories || [] });
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
    const { name, parent_id, display_order = 0, image_url } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    }

    const slug = body.slug ? slugifyCategory(body.slug) : slugifyCategory(name);

    const { data: category, error } = await supabase
      .from("retail_categories")
      .insert({
        organization_id: organization.id,
        name: name.trim(),
        slug,
        parent_id: parent_id || null,
        display_order: Number(display_order),
        image_url: image_url || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ category }, { status: 201 });
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

    // Check if reordering a batch of categories
    if (Array.isArray(body.reorder)) {
      const updates = body.reorder.map((item: { id: string; display_order: number }) =>
        supabase
          .from("retail_categories")
          .update({ display_order: item.display_order })
          .eq("id", item.id)
          .eq("organization_id", organization.id)
      );
      await Promise.all(updates);
      return NextResponse.json({ success: true });
    }

    const { id, name, parent_id, display_order, image_url } = body;
    if (!id) {
      return NextResponse.json({ error: "Category id is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name) {
      updateData.name = name.trim();
      updateData.slug = slugifyCategory(name);
    }
    if (parent_id !== undefined) updateData.parent_id = parent_id || null;
    if (display_order !== undefined) updateData.display_order = Number(display_order);
    if (image_url !== undefined) updateData.image_url = image_url;

    const { data: updated, error } = await supabase
      .from("retail_categories")
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", organization.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ category: updated });
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
      return NextResponse.json({ error: "Category id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("retail_categories")
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
