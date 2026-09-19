import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { OrderBoard } from "./order-board";
import { NewOrderModal } from "./new-order-modal";

export default async function RetailOrdersPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");

  // Verify they are actually retail
  const businessCategory = (organization.extra as any)?.business_category;
  if (businessCategory !== "Retail & e-commerce") {
    redirect("/app");
  }

  // Fetch orders and their items
  const { data: orders } = await supabase
    .from("retail_orders")
    .select(`
      *,
      items:retail_order_items(*)
    `)
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/app/retail" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Order Pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your incoming WhatsApp orders. Tap to advance their fulfillment status.
          </p>
        </div>
        <NewOrderModal organizationId={organization.id} />
      </header>
      
      <div className="min-h-0 flex-1 overflow-x-auto pb-4">
        <OrderBoard initialOrders={orders ?? []} organizationId={organization.id} />
      </div>
    </div>
  );
}
