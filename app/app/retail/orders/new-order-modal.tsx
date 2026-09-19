"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function NewOrderModal({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    total_amount: "",
    payment_status: "pending"
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    const supabase = createClient();
    const { error } = await supabase
      .from("retail_orders")
      .insert({
        organization_id: organizationId,
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        customer_address: formData.customer_address || null,
        total_amount: Number(formData.total_amount),
        payment_status: formData.payment_status,
        status: "new"
      });

    setSaving(false);
    
    if (error) {
      alert("Failed to create order");
    } else {
      setOpen(false);
      setFormData({ customer_name: "", customer_phone: "", customer_address: "", total_amount: "", payment_status: "pending" });
      router.refresh();
    }
  };

  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-inset ring-indigo-500 hover:bg-indigo-700 transition-colors"
      >
        <Plus className="size-4" /> New Order
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Create Manual Order</h2>
              <button onClick={() => setOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Customer Name
                <input required type="text" value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="E.g. Rahul Sharma" />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Customer Phone (WhatsApp)
                <input required type="text" value={formData.customer_phone} onChange={e => setFormData({...formData, customer_phone: e.target.value})} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="E.g. 9876543210" />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Total Amount (₹)
                <input required type="number" min="0" value={formData.total_amount} onChange={e => setFormData({...formData, total_amount: e.target.value})} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="E.g. 1500" />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Payment Status
                <select value={formData.payment_status} onChange={e => setFormData({...formData, payment_status: e.target.value})} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                  <option value="pending">Pending</option>
                  <option value="cod">Cash on Delivery (COD)</option>
                  <option value="paid">Paid</option>
                </select>
              </label>

              <div className="mt-2 flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex min-w-[100px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-indigo-700 disabled:opacity-70">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "Save Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
