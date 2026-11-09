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
    <section className="flex flex-col gap-2.5 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">MOBILE ALERTS</span>
          <span className="h-3 w-px bg-slate-200" />
          <h3 className="text-xs font-bold text-slate-900">Operator notification controls</h3>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Run a patient-free device test, or archive stale alerts. Neither action sends WhatsApp messages.
        </p>
      </div>
      <nav className="flex flex-wrap items-center gap-2 shrink-0">
        <button 
          className="inline-flex h-7.5 items-center justify-center gap-1.5 rounded-lg border border-teal-200/80 bg-teal-50/40 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-50 shadow-2xs transition disabled:opacity-50" 
          onClick={testMobileAlert} 
          disabled={working!==null}
        >
          <BellRing size={13}/>{working==="mobile-alert-test"?"Sending test…":"Send test alert"}
        </button>
        <button 
          className="inline-flex h-7.5 items-center justify-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition disabled:opacity-50" 
          onClick={archiveHistoricalAlerts} 
          disabled={working!==null}
        >
          <ClipboardCheck size={13}/>{working==="archive-historical-alerts"?"Archiving…":"Archive history"}
        </button>
      </nav>
    </section>
  );
}
