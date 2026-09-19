"use client";

import { useState } from "react";
import { Plus, X, Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function BroadcastForm({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    template_text: "",
    audience_type: "all_customers",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    const supabase = createClient();
    
    // Create the broadcast record
    const { data: broadcast, error: broadcastError } = await supabase
      .from("retail_broadcasts")
      .insert({
        organization_id: organizationId,
        name: formData.name,
        template_text: formData.template_text,
        audience_type: formData.audience_type,
        status: "sending" // Simulated state
      })
      .select()
      .single();

    if (broadcastError) {
      alert("Failed to create broadcast");
      setSaving(false);
      return;
    }

    // If it's all_customers, we would normally fan-out in an Edge Function.
    // For this prototype, we'll quickly query the view and insert recipients directly.
    if (formData.audience_type === "all_customers") {
      const { data: customers } = await supabase
        .from("retail_customers_view")
        .select("phone, name")
        .eq("organization_id", organizationId);
        
      if (customers && customers.length > 0) {
        const recipients = customers.map(c => ({
          broadcast_id: broadcast.id,
          organization_id: organizationId,
          customer_phone: c.phone,
          customer_name: c.name,
          status: "pending"
        }));
        
        await supabase.from("retail_broadcast_recipients").insert(recipients);
      }
      
      // Simulate completion after a short delay
      setTimeout(async () => {
        await supabase
          .from("retail_broadcasts")
          .update({ status: "completed" })
          .eq("id", broadcast.id);
        router.refresh();
      }, 2000);
    }

    setSaving(false);
    setOpen(false);
    setFormData({ name: "", template_text: "", audience_type: "all_customers" });
    router.refresh();
  };

  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm ring-1 ring-inset ring-rose-500 hover:bg-rose-700 transition-colors"
      >
        <Plus className="size-4" /> New Broadcast
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Send className="size-5 text-rose-500" /> New Broadcast Campaign
              </h2>
              <button onClick={() => setOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Campaign Name
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500" placeholder="E.g. Diwali Flash Sale" />
                <span className="text-[11px] font-normal text-slate-500">Internal name for your reference</span>
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Message Content
                <textarea required value={formData.template_text} onChange={e => setFormData({...formData, template_text: e.target.value})} rows={4} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 resize-none" placeholder="🎉 Special Offer! Get 20% off on all orders this weekend. Reply with 'ORDER' to see our catalog!" />
                <span className="text-[11px] font-normal text-slate-500">In a real app, this would be a pre-approved Meta WhatsApp Template.</span>
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Audience
                <select value={formData.audience_type} onChange={e => setFormData({...formData, audience_type: e.target.value})} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500">
                  <option value="all_customers">All Past Customers (from Orders)</option>
                  <option value="custom" disabled>Custom CSV Upload (Coming Soon)</option>
                </select>
              </label>

              <div className="mt-2 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-rose-700 disabled:opacity-70">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <>Send Campaign <Send className="size-3.5" /></>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
