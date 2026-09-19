"use client";

import { useState } from "react";
import { CreditCard, Flame, MessageSquare, AlertTriangle, ShieldCheck } from "lucide-react";

type ActiveWalletProps = {
  wallet: { balance_paise: number; warning_threshold_paise: number } | null;
  tier: { tier_name: string; markup_percentage: number } | null;
  organizationId: string;
};

export function ActiveWallet({ wallet, tier, organizationId }: ActiveWalletProps) {
  const [amount, setAmount] = useState<number>(1000);
  const [loading, setLoading] = useState(false);

  const balance = wallet ? (wallet.balance_paise / 100) : 0;
  const isLow = balance < ((wallet?.warning_threshold_paise || 50000) / 100);

  const handleTopUp = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/razorpay-topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_inr: amount, organization_id: organizationId }),
      });
      const data = await res.json();
      if (data.error) {
        alert("Error: " + data.error);
        return;
      }
      // Here we would initialize Razorpay checkout.js
      alert(`Razorpay Checkout simulation: \nOrder ID: ${data.order_id}\nAmount: ₹${amount}\n\n(In production, the Razorpay window would open here).`);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="size-5 text-[#1bc5a8]" />
            WhatsApp Message Wallet
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Prepaid balance for operational messages (Booking Confirmations & Reminders).
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800">
          <ShieldCheck className="size-4 text-blue-500" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            {tier?.tier_name || "Starter"} Tier
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Balance Card */}
        <div className={`relative overflow-hidden rounded-xl border p-5 ${
          isLow ? "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20" 
                : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50"
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isLow ? 'text-amber-600 dark:text-amber-500' : 'text-slate-500 dark:text-slate-400'}`}>
              Available Balance
            </span>
            {isLow && <AlertTriangle className="size-4 text-amber-500" />}
          </div>
          
          <div className="mt-4 flex items-baseline gap-1">
            <b className={`text-4xl font-extrabold tracking-tight ${isLow ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
              ₹{balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </b>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setAmount(500)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${amount === 500 ? 'bg-[#1bc5a8] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200'}`}>+ ₹500</button>
            <button onClick={() => setAmount(1000)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${amount === 1000 ? 'bg-[#1bc5a8] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200'}`}>+ ₹1,000</button>
            <button onClick={() => setAmount(5000)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${amount === 5000 ? 'bg-[#1bc5a8] text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200'}`}>+ ₹5,000</button>
          </div>

          <button 
            onClick={handleTopUp}
            disabled={loading}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-70 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <CreditCard className="size-4" />
            {loading ? "Initializing..." : `Add ₹${amount.toLocaleString()} via Razorpay`}
          </button>
        </div>

        {/* Volume Rewards */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/50">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Flame className="size-4 text-rose-500" />
              Volume Rewards
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Your current markup on Meta's base messaging rate is <b className="text-slate-900 dark:text-white">{tier?.markup_percentage || 20}%</b>.
            </p>
          </div>
          
          <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
            <div className="flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              <span>Starter (20%)</span>
              <span>Pro (15%)</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full bg-gradient-to-r from-blue-400 to-[#1bc5a8] w-1/3"></div>
            </div>
            <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 text-center">
              Send ₹2,000 more this month to unlock Pro tier markup.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
