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
        {/* Desktop Header */}
        <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr] bg-slate-50 px-6 py-4 text-xs font-semibold uppercase text-slate-500 md:grid">
          <div>Customer</div>
          <div>WhatsApp Phone</div>
          <div className="text-right">Total Orders</div>
          <div className="text-right">Lifetime Value</div>
          <div className="text-right">Last Order</div>
        </div>
        
        <div className="divide-y divide-slate-100">
          {safeCustomers.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Users className="mx-auto mb-3 size-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-900">No customers found</p>
              <p className="text-xs text-slate-500">Customers will appear here automatically when orders are created.</p>
            </div>
          ) : (
            safeCustomers.map((customer) => (
              <div key={customer.phone} className="grid grid-cols-1 gap-3 p-4 transition-colors hover:bg-slate-50 md:grid-cols-[2fr_1fr_1fr_1fr_1fr] md:items-center md:gap-0 md:px-6 md:py-4">
                <div className="flex flex-col md:block">
                  <span className="text-xs font-semibold uppercase text-slate-400 md:hidden">Customer</span>
                  <span className="font-bold text-slate-900">{customer.name || "Unknown"}</span>
                </div>
                <div className="flex flex-col md:block">
                  <span className="text-xs font-semibold uppercase text-slate-400 md:hidden">Phone</span>
                  <span className="font-mono text-sm text-slate-600">{customer.phone}</span>
                </div>
                <div className="flex items-center justify-between md:block md:text-right">
                  <span className="text-xs font-semibold uppercase text-slate-400 md:hidden">Total Orders</span>
                  <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                    {customer.total_orders}
                  </span>
                </div>
                <div className="flex items-center justify-between md:block md:text-right">
                  <span className="text-xs font-semibold uppercase text-slate-400 md:hidden">Lifetime Value</span>
                  <span className="font-bold text-emerald-600">₹{customer.total_spent}</span>
                </div>
                <div className="flex items-center justify-between md:block md:text-right">
                  <span className="text-xs font-semibold uppercase text-slate-400 md:hidden">Last Order</span>
                  <span className="text-sm text-slate-500">
                    {new Intl.DateTimeFormat("en-IN", { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(customer.last_order_date))}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
