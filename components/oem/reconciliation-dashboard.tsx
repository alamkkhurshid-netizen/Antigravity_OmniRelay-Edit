"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertTriangle, Download } from "lucide-react";

export interface ReconciliationCycle {
  period: string; // e.g. "October 2026"
  metaBilledINR: number;
  internalLedgerINR: number;
  variancePercentage: number;
  status: "reconciled" | "discrepancy" | "pending";
  totalMessages: number;
}

const RECONCILIATION_HISTORY: ReconciliationCycle[] = [
  {
    period: "October 2026 (MTD)",
    metaBilledINR: 4250.0,
    internalLedgerINR: 4210.0,
    variancePercentage: 0.95,
    status: "reconciled",
    totalMessages: 12450,
  },
  {
    period: "September 2026",
    metaBilledINR: 18450.0,
    internalLedgerINR: 18290.0,
    variancePercentage: 0.87,
    status: "reconciled",
    totalMessages: 54100,
  },
  {
    period: "August 2026",
    metaBilledINR: 14200.0,
    internalLedgerINR: 13850.0,
    variancePercentage: 2.52, // > 2% flag
    status: "discrepancy",
    totalMessages: 41200,
  },
];

export function ReconciliationDashboard() {
  const [cycles] = useState<ReconciliationCycle[]>(RECONCILIATION_HISTORY);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white">Monthly Meta Cloud Reconciliation</h2>
            <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-blue-400 ring-1 ring-inset ring-blue-500/20">
              Audit Standard: &lt; 2.0%
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Automated verification comparing Meta monthly invoice usage statements against OmniRelay immutable ledger.
          </p>
        </div>

        <button
          onClick={() => alert("Reconciliation log downloaded.")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm"
        >
          <Download className="size-3.5 text-teal-400" />
          Export Audit Report
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">Billing Cycle</th>
              <th className="px-4 py-3 text-right">Meta Invoiced</th>
              <th className="px-4 py-3 text-right">Internal Ledger</th>
              <th className="px-4 py-3 text-right">Variance (%)</th>
              <th className="px-4 py-3 text-center">Messages</th>
              <th className="px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {cycles.map((cycle) => {
              const isFlagged = cycle.variancePercentage > 2.0;

              return (
                <tr key={cycle.period} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3.5 font-bold text-white">{cycle.period}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-300">
                    ₹{cycle.metaBilledINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-teal-300">
                    ₹{cycle.internalLedgerINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`px-4 py-3.5 text-right font-mono font-bold ${isFlagged ? "text-amber-400" : "text-emerald-400"}`}>
                    {cycle.variancePercentage.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3.5 text-center text-slate-400 font-medium">
                    {cycle.totalMessages.toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        isFlagged
                          ? "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20"
                          : "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20"
                      }`}
                    >
                      {isFlagged ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3" />}
                      {cycle.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
