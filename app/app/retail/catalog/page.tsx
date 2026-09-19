import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { CatalogManager } from "./catalog-manager";

export default async function RetailCatalogPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");

  // Verify they are actually retail
  const businessCategory = (organization.extra as any)?.business_category;
  if (businessCategory !== "Retail & e-commerce") {
    redirect("/app");
  }

  const { data: products } = await supabase
    .from("retail_catalog")
    .select("*")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto max-w-4xl py-6">
      <Link href="/app/retail" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="size-4" /> Back to Dashboard
      </Link>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your Digital Catalog</h1>
        <p className="mt-2 text-sm text-slate-500">
          Add your top-selling products here. These will be automatically formatted and sent to customers who message your WhatsApp number.
        </p>
      </header>
      
      <CatalogManager initialProducts={products ?? []} organizationId={organization.id} />
    </div>
  );
}
