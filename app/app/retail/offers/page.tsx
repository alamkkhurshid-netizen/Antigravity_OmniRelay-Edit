import Link from "next/link";
import { ArrowLeft, Tag, Percent, Award, Gift } from "lucide-react";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { OfferManager } from "./offer-manager";

export const metadata = {
  title: "Offers & Loyalty — Retail Management",
};

export default async function RetailOffersPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");

  // Fetch active discounts
  const { data: discounts } = await supabase
    .from("retail_discounts")
    .select("*")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });

  // Fetch customer stats for loyalty tiers
  const { data: customerStats } = await supabase
    .from("retail_customers_view")
    .select("*")
    .eq("organization_id", organization.id);

  return (
    <div className="flex flex-col gap-6 pb-12 max-w-5xl mx-auto">
      <header className="flex flex-col gap-4">
        <div>
          <Link
            href="/app/retail"
            className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <Tag className="size-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Offers & Loyalty Program</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Create discount codes, bundle offers, and configure automated loyalty tiers to reward repeat buyers.
          </p>
        </div>
      </header>

      {/* Top Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
            <Percent className="size-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Coupons</p>
            <p className="text-2xl font-extrabold text-slate-900">{discounts?.length || 0}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <Award className="size-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Loyalty Tiers</p>
            <p className="text-2xl font-extrabold text-slate-900">4 Tiers</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <Gift className="size-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Enrolled Buyers</p>
            <p className="text-2xl font-extrabold text-slate-900">{customerStats?.length || 0}</p>
          </div>
        </div>
      </div>

      <OfferManager initialDiscounts={discounts || []} organizationId={organization.id} />
    </div>
  );
}
