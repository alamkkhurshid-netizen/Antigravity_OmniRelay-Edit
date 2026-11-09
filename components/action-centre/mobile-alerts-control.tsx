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
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">MOBILE ALERTS</span>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 leading-snug">Operator notification controls</h2>
        <p className="mt-1.5 max-w-2xl text-sm font-medium text-slate-600 leading-relaxed">
          Run a patient-free device test, or archive only stale alerts. Neither action sends WhatsApp messages.
        </p>
      </div>
      <nav className="flex flex-wrap items-center gap-2.5 shrink-0">
        <button 
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-xs font-bold text-teal-700 hover:bg-teal-50/50 shadow-2xs transition" 
          onClick={testMobileAlert} 
          disabled={working!==null}
        >
          <BellRing size={14}/>{working==="mobile-alert-test"?"Sending test…":"Send test alert"}
        </button>
        <button 
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition" 
          onClick={archiveHistoricalAlerts} 
          disabled={working!==null}
        >
          <ClipboardCheck size={14}/>{working==="archive-historical-alerts"?"Archiving…":"Archive history"}
        </button>
      </nav>
    </section>
  );
}
