import Link from "next/link";
import { ArrowLeft, TrendingUp, ShoppingCart, IndianRupee, Activity } from "lucide-react";
import { getWorkspace } from "@/lib/workspace";

export default async function AnalyticsPage() {
  const { supabase, organization } = await getWorkspace();
  
  // Fetch basic analytics from retail_orders
  const { data: orders } = await supabase
    .from("retail_orders")
    .select("total_amount, status")
    .eq("organization_id", organization.id);

  const safeOrders = orders || [];
  
  const totalRevenue = safeOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const totalOrdersCount = safeOrders.length;
  const completedOrders = safeOrders.filter(o => o.status === 'completed').length;
  const averageOrderValue = totalOrdersCount > 0 ? (totalRevenue / totalOrdersCount).toFixed(2) : 0;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/app/retail" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <TrendingUp className="size-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Analytics Dashboard</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Real-time insights into your WhatsApp commerce performance.
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* Total Revenue */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <IndianRupee className="size-5" />
            </div>
            <h3 className="font-semibold text-slate-600">Gross Revenue</h3>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">₹{totalRevenue.toLocaleString()}</div>
            <p className="mt-1 text-sm font-medium text-emerald-600 flex items-center gap-1">
              <Activity className="size-3" /> Live
            </p>
          </div>
        </div>

        {/* Total Orders */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <ShoppingCart className="size-5" />
            </div>
            <h3 className="font-semibold text-slate-600">Total Orders</h3>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">{totalOrdersCount}</div>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {completedOrders} completed
            </p>
          </div>
        </div>

        {/* AOV */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
              <TrendingUp className="size-5" />
            </div>
            <h3 className="font-semibold text-slate-600">Avg. Order Value</h3>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">₹{aovLocaleString(averageOrderValue)}</div>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Per customer transaction
            </p>
          </div>
        </div>
      </div>
      
      {/* Empty Chart Placeholder for Future */}
      <div className="min-h-[300px] flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 border-dashed text-slate-400">
        <Activity className="size-8 opacity-20 mb-3" />
        <p className="text-sm font-medium">Detailed Revenue Charts</p>
        <p className="text-xs">Coming in next update</p>
      </div>
    </div>
  );
}

function aovLocaleString(val: string | number) {
  return Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
