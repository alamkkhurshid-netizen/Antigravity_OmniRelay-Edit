"use client";

import { BellRing, ClipboardCheck } from "lucide-react";

interface MobileAlertsControlProps {
  canManageNotifications: boolean;
  working: string | null;
  testMobileAlert: () => void;
  archiveHistoricalAlerts: () => void;
  buttonBase: string;
}

export function MobileAlertsControl({
  canManageNotifications, working, testMobileAlert, archiveHistoricalAlerts, buttonBase
}: MobileAlertsControlProps) {
  if (!canManageNotifications) return null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs lg:flex-row lg:items-center lg:justify-between">
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">MOBILE ALERTS</span>
        <h2 className="mt-1 text-sm font-bold text-slate-900 leading-snug">Operator notification controls</h2>
        <p className="mt-0.5 max-w-2xl text-xs text-slate-500 leading-relaxed">
          Run a patient-free device test, or archive only stale alerts. Neither action sends WhatsApp messages.
        </p>
      </div>
      <nav className="flex flex-wrap items-center gap-2 shrink-0">
        <button 
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50/50 shadow-2xs transition" 
          onClick={testMobileAlert} 
          disabled={working!==null}
        >
          <BellRing size={13}/>{working==="mobile-alert-test"?"Sending test…":"Send test alert"}
        </button>
        <button 
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition" 
          onClick={archiveHistoricalAlerts} 
          disabled={working!==null}
        >
          <ClipboardCheck size={13}/>{working==="archive-historical-alerts"?"Archiving…":"Archive history"}
        </button>
      </nav>
    </section>
  );
}
