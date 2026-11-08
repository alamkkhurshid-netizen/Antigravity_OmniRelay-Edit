import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { StorefrontClient } from "./storefront-client";
import { RetailProduct, RetailCategory } from "@/lib/retail/catalog";

export const metadata = {
  title: "Online Store — Powered by OmniRelay",
  description: "Browse products and order directly on WhatsApp.",
};

export default async function PublicStorefrontPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const admin = createAdminClient();

  // 1. Resolve organization by ID or slug
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspace);
  let orgQuery = admin.from("organizations").select("id, name, extra");

  if (isUuid) {
    orgQuery = orgQuery.eq("id", workspace);
  } else {
    orgQuery = orgQuery.or(`id.eq.${workspace},name.ilike.%${workspace}%`);
  }

  const { data: org, error: orgErr } = await orgQuery.maybeSingle();

  if (orgErr || !org) {
    notFound();
  }

  const orgExtra = (org.extra || {}) as Record<string, unknown>;
  const storePhone = String(
    orgExtra.whatsapp_phone ||
    orgExtra.phone ||
    orgExtra.support_phone ||
    "919876543210"
  );

  // 2. Fetch active products
  const { data: rawProducts } = await admin
    .from("retail_products")
    .select("*, retail_categories(id, name, slug)")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  // 3. Fetch categories
  const { data: rawCategories } = await admin
    .from("retail_categories")
    .select("*")
    .eq("organization_id", org.id)
    .order("display_order", { ascending: true });

  const products = (rawProducts || []) as RetailProduct[];
  const categories = (rawCategories || []) as RetailCategory[];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <StorefrontClient
        organization={{
          id: org.id,
          name: org.name || "Store",
          phone: storePhone,
          description: typeof orgExtra.description === "string" ? orgExtra.description : "Official WhatsApp Store",
          logoUrl: typeof orgExtra.logo_url === "string" ? orgExtra.logo_url : null,
        }}
        initialProducts={products}
        categories={categories}
      />
    </main>
  );
}
