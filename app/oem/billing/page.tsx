import { createClient } from "@/lib/supabase/server";
import { CreditCard, IndianRupee, MessageSquare, ShieldAlert } from "lucide-react";

export default async function OemBillingPage() {
  const supabase = await createClient();

  const { data: rateCards } = await supabase
    .from("whatsapp_rate_cards")
    .select("*")
    .eq("channel", "whatsapp")
    .eq("country_code", "IN")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Operational Billing</h1>
          <p className="mt-1 text-sm text-slate-400">Manage WhatsApp margins and rate cards globally.</p>
        </div>
      </header>

      {/* Rate Cards Manager */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <MessageSquare className="size-5 text-blue-400" />
          WhatsApp API Margin Config (India)
        </h2>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(rateCards || []).map((card: any) => (
            <article key={card.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {card.message_category}
                </span>
                <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${
                  card.verification_status === 'verified' 
                    ? 'bg-[#1bc5a8]/10 text-[#1bc5a8] ring-[#1bc5a8]/30' 
                    : 'bg-amber-400/10 text-amber-400 ring-amber-400/30'
                }`}>
                  {card.verification_status}
                </span>
              </div>
              
              <div className="mt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Meta Base Rate:</span>
                  <span className="font-medium text-slate-300">₹{(card.base_rate_paise / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Platform Margin:</span>
                  <span className="font-medium text-blue-400">+ ₹{(card.platform_fee_paise / 100).toFixed(2)}</span>
                </div>
                <div className="border-t border-slate-800 pt-3 flex justify-between text-base font-bold">
                  <span className="text-white">Tenant Pays:</span>
                  <span className="text-[#1bc5a8]">₹{((card.base_rate_paise + card.platform_fee_paise) / 100).toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-5">
                <button className="w-full rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 transition-colors">
                  Adjust Margin
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Razorpay Master Keys Alert */}
      <section className="mt-8 rounded-xl border border-amber-900/50 bg-amber-950/20 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-amber-900/50 p-2">
            <IndianRupee className="size-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-amber-100">Razorpay Master Integration</h2>
            <p className="mt-1 text-sm text-amber-300/70">
              The platform is currently running using environment variables for the Master Razorpay Account. 
              Subscriptions are active.
            </p>
            <div className="mt-4">
              <button disabled className="rounded-lg bg-amber-900/50 px-4 py-2 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-800 opacity-50 cursor-not-allowed">
                Rotate Keys
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
