import Link from "next/link";
import { ArrowLeft, Users, Download, Search } from "lucide-react";
import { getWorkspace } from "@/lib/workspace";

export default async function CustomersPage() {
  const { supabase } = await getWorkspace();
  
  // Fetch from the view we just created in the migration
  const { data: customers } = await supabase
    .from("retail_customers_view")
    .select("*")
    .order("last_order_date", { ascending: false });

  const safeCustomers = customers || [];

  return (
    <div className="flex flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/app/retail" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <Users className="size-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customer CRM</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Automatically built from your WhatsApp orders. Your highest value customers at a glance.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search phone or name..." 
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm outline-none focus:border-indigo-500 sm:w-64"
            />
          </div>
          <button className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
            <Download className="size-4" /> Export
          </button>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Customer</th>
                <th className="px-6 py-4 font-semibold">WhatsApp Phone</th>
                <th className="px-6 py-4 font-semibold text-right">Total Orders</th>
                <th className="px-6 py-4 font-semibold text-right">Lifetime Value</th>
                <th className="px-6 py-4 font-semibold">Last Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {safeCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Users className="mx-auto mb-3 size-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-900">No customers found</p>
                    <p className="text-xs text-slate-500">Customers will appear here automatically when orders are created.</p>
                  </td>
                </tr>
              ) : (
                safeCustomers.map((customer) => (
                  <tr key={customer.phone} className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4 font-bold text-slate-900">
                      {customer.name || "Unknown"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs">
                      {customer.phone}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-medium">
                      <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                        {customer.total_orders}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-bold text-emerald-600">
                      ₹{customer.total_spent}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-500">
                      {new Intl.DateTimeFormat("en-IN", {
                        day: 'numeric', month: 'short', year: 'numeric'
                      }).format(new Date(customer.last_order_date))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
