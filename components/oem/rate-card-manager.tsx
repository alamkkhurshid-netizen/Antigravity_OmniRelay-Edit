"use client";

import React, { useState } from "react";
import { Calculator, CheckCircle2 } from "lucide-react";

export interface RateCardItem {
  id: string;
  channel: string;
  country_code: string;
  message_category: "utility" | "marketing" | "authentication" | "service";
  base_rate_paise: number;
  platform_fee_paise: number;
  active: boolean;
  verification_status: "draft" | "verified" | "retired";
}

const DEFAULT_RATES: RateCardItem[] = [
  {
    id: "rc-util",
    channel: "whatsapp",
    country_code: "IN",
    message_category: "utility",
    base_rate_paise: 35, // ₹0.35
    platform_fee_paise: 15, // ₹0.15
    active: true,
    verification_status: "verified",
  },
  {
    id: "rc-mkt",
    channel: "whatsapp",
    country_code: "IN",
    message_category: "marketing",
    base_rate_paise: 82, // ₹0.82
    platform_fee_paise: 28, // ₹0.28
    active: true,
    verification_status: "verified",
  },
  {
    id: "rc-srv",
    channel: "whatsapp",
    country_code: "IN",
    message_category: "service",
    base_rate_paise: 35, // ₹0.35
    platform_fee_paise: 15, // ₹0.15
    active: true,
    verification_status: "verified",
  },
  {
    id: "rc-auth",
    channel: "whatsapp",
    country_code: "IN",
    message_category: "authentication",
    base_rate_paise: 12, // ₹0.12
    platform_fee_paise: 8, // ₹0.08
    active: true,
    verification_status: "verified",
  },
];

export function RateCardManager({ initialRateCards }: { initialRateCards?: RateCardItem[] }) {
  const [rateCards] = useState<RateCardItem[]>(
    initialRateCards && initialRateCards.length > 0 ? initialRateCards : DEFAULT_RATES
  );

  // Simulator state
  const [simUtilityCount, setSimUtilityCount] = useState<number>(5000);
  const [simMarketingCount, setSimMarketingCount] = useState<number>(10000);

  const utilityCard = rateCards.find((r) => r.message_category === "utility") || DEFAULT_RATES[0];
  const marketingCard = rateCards.find((r) => r.message_category === "marketing") || DEFAULT_RATES[1];

  const utilityTotalPaise = (utilityCard.base_rate_paise + utilityCard.platform_fee_paise) * simUtilityCount;
  const marketingTotalPaise = (marketingCard.base_rate_paise + marketingCard.platform_fee_paise) * simMarketingCount;
  const grandTotalINR = ((utilityTotalPaise + marketingTotalPaise) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
  });

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white">WhatsApp Cloud Rate Cards (India Region)</h2>
          <p className="mt-1 text-xs text-slate-400">
            Official Meta base rates + OmniRelay platform processing fees per message category.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
          <CheckCircle2 className="size-3.5" />
          Verified Active Rates
        </span>
      </div>

      {/* Rate Cards Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Meta Base Rate</th>
              <th className="px-4 py-3">Platform Fee</th>
              <th className="px-4 py-3 text-right">Total Rate (INR)</th>
              <th className="px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rateCards.map((rc) => {
              const totalPaise = rc.base_rate_paise + rc.platform_fee_paise;
              const totalINR = (totalPaise / 100).toFixed(2);

              return (
                <tr key={rc.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3.5">
                    <b className="capitalize text-slate-200">{rc.message_category}</b>
                    <span className="text-[11px] text-slate-500 block">
                      {rc.message_category === "utility"
                        ? "Booking confirmations, reminders"
                        : rc.message_category === "marketing"
                        ? "Broadcast promotions & offers"
                        : rc.message_category === "service"
                        ? "Inbound customer support"
                        : "One-time passwords"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-300 font-mono">₹{(rc.base_rate_paise / 100).toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-slate-300 font-mono">₹{(rc.platform_fee_paise / 100).toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-right font-bold text-teal-300 font-mono">₹{totalINR}</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="inline-flex rounded-md bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-400">
                      {rc.verification_status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Simulator Section (S5-09) */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="size-4 text-teal-400" />
          <h3 className="text-sm font-bold text-slate-200">Rate Impact Simulator</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 items-end">
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">
              Simulated Utility Messages (Monthly)
            </label>
            <input
              type="number"
              value={simUtilityCount}
              onChange={(e) => setSimUtilityCount(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">
              Simulated Marketing Broadcasts (Monthly)
            </label>
            <input
              type="number"
              value={simMarketingCount}
              onChange={(e) => setSimMarketingCount(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-400"
            />
          </div>

          <div className="rounded-lg bg-teal-500/10 border border-teal-500/20 p-3">
            <span className="text-[10px] font-bold uppercase text-teal-400 block">Estimated Platform Spend</span>
            <div className="text-xl font-black text-white mt-0.5">₹{grandTotalINR}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
