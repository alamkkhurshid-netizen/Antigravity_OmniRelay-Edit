"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Plan = {
  id: string;
  name: string;
  monthly_price_paise: number;
  max_locations: number;
  max_seats: number;
  conversations_quota: number;
};

export function BillingWorkspace({
  plans,
  currentPlan,
  status,
  isTest,
  business,
}: {
  plans: Plan[];
  currentPlan: string | null;
  status: string;
  isTest: boolean;
  business: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [billingMode, setBillingMode] = useState<"autopay" | "monthly">("autopay");

  async function loadRazorpay(): Promise<void> {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Razorpay checkout could not load"));
      document.head.appendChild(s);
    });
  }

  async function loadCashfree(): Promise<void> {
    if ((window as unknown as { Cashfree?: unknown }).Cashfree) return;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Cashfree checkout could not load"));
      document.head.appendChild(s);
    });
  }

  async function choose(plan: Plan) {
    setBusy(plan.id);
    setMessage("");

    try {
      const response = await fetch("/api/billing/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: plan.id, billing_mode: billingMode }),
      });
      const order = await response.json();
      if (!response.ok) throw new Error(order.error || "Checkout could not start");

      // --- BRANCH 0: CASHFREE RECURRING SUBSCRIPTION (AUTOPAY) ---
      if (order.gateway === "cashfree_subscription" && order.auth_link) {
        window.location.href = order.auth_link;
        return;
      }

      // --- BRANCH A: CASHFREE MODAL CHECKOUT ---
      if (order.gateway === "cashfree" || order.payment_session_id) {
        await loadCashfree();
        const CashfreeInit = (window as unknown as { Cashfree?: (opts: { mode: string }) => { checkout: (opts: Record<string, unknown>) => Promise<{ error?: unknown; paymentDetails?: unknown }> } }).Cashfree;
        if (!CashfreeInit) throw new Error("Cashfree checkout is unavailable");

        const cf = CashfreeInit({ mode: order.mode || "production" });
        cf.checkout({
          paymentSessionId: order.payment_session_id,
          redirectTarget: "_modal",
        }).then(async (result) => {
          if (result.error) {
            setBusy(null);
            setMessage("Payment window closed or cancelled.");
            return;
          }

          // Verify with backend
          setMessage("Verifying payment with Cashfree…");
          const verify = await fetch("/api/billing/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: order.order_id }),
          });
          const confirmed = await verify.json();
          if (!verify.ok) {
            setBusy(null);
            setMessage(confirmed.error || "Payment verification failed");
            return;
          }
          setMessage(`${order.plan_name} is active! Refreshing your workspace…`);
          window.setTimeout(() => router.refresh(), 1000);
        }).catch((err) => {
          setBusy(null);
          setMessage(err instanceof Error ? err.message : "Payment cancelled");
        });
        return;
      }

      // --- BRANCH B: RAZORPAY MODAL CHECKOUT (FALLBACK) ---
      await loadRazorpay();
      const RazorpayConstructor = (window as unknown as { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void } }).Razorpay;
      if (!RazorpayConstructor) throw new Error("Secure checkout is unavailable");

      new RazorpayConstructor({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "OmniRelay",
        description: `${order.plan_name} · one month`,
        theme: { color: "#168de2" },
        handler: async (result: unknown) => {
          const verify = await fetch("/api/billing/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result),
          });
          const confirmed = await verify.json();
          if (!verify.ok) {
            setBusy(null);
            setMessage(confirmed.error || "Payment verification failed");
            return;
          }
          setMessage(`${confirmed.plan_name} is active. Refreshing your workspace…`);
          window.setTimeout(() => router.refresh(), 900);
        },
        modal: { ondismiss: () => setBusy(null) },
      }).open();

    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout could not start");
      setBusy(null);
    }
  }

  return (
    <>
      <div className="billing-mode">
        <div>
          <b>Secure Online Checkout (UPI, Cards, NetBanking)</b>
          <span>Instant automated subscription activation.</span>
        </div>
        <i>LIVE</i>
      </div>

      {/* Dual Billing Mode Choice (Auto-Debit vs Monthly Invoice) */}
      <div className="my-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setBillingMode("autopay")}
          className={`flex flex-col items-start p-4 text-left rounded-xl border-2 transition-all cursor-pointer ${
            billingMode === "autopay"
              ? "border-[#1bc5a8] bg-[#1bc5a8]/10 shadow-sm"
              : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#1bc5a8]">⚡ Auto-Debit Renewal</span>
            <span className="text-[10px] font-bold bg-[#1bc5a8]/20 text-[#0f8b76] dark:text-[#32e0c2] rounded px-1.5 py-0.5">Recommended</span>
          </div>
          <h4 className="mt-1 font-bold text-slate-900 dark:text-white">UPI Autopay & Card Mandate</h4>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Hassle-free 30-day recurring debit. Zero service interruption for active patient calls.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setBillingMode("monthly")}
          className={`flex flex-col items-start p-4 text-left rounded-xl border-2 transition-all cursor-pointer ${
            billingMode === "monthly"
              ? "border-[#1bc5a8] bg-[#1bc5a8]/10 shadow-sm"
              : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">📄 B2B Accounts</span>
            <span className="text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded px-1.5 py-0.5">3-Day Grace</span>
          </div>
          <h4 className="mt-1 font-bold text-slate-900 dark:text-white">Pay Monthly (Tax Invoice)</h4>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Monthly GST invoice with 3-day grace period. Pay manually via UPI, Cards, Netbanking.
          </p>
        </button>
      </div>

      {message && <div className="billing-message" role="status">{message}</div>}
      <div className="plan-grid">
        {plans.map((plan) => (
          <article className={plan.id === currentPlan ? "current" : ""} key={plan.id}>
            <span>{plan.id === currentPlan ? status.toUpperCase() : "MONTHLY"}</span>
            <h3>{plan.name}</h3>
            <b>₹{plan.monthly_price_paise / 100}<small>/month</small></b>
            <ul>
              <li>{plan.max_locations} locations</li>
              <li>{plan.max_seats} team seats</li>
              <li>{plan.conversations_quota.toLocaleString("en-IN")} conversations</li>
            </ul>
            <button disabled={busy !== null} onClick={() => choose(plan)}>
              {busy === plan.id ? "Opening secure checkout…" : plan.id === currentPlan && status === "active" ? "Renew this plan" : `Choose ${plan.name}`}
            </button>
          </article>
        ))}
      </div>
      <p className="billing-footnote">
        {business} is charged for one month after verified payment.
      </p>
    </>
  );
}
