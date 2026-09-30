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
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-secondary/40 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <span className="text-xs font-black tracking-[.15em] text-primary">MOBILE ALERTS</span>
        <h2 className="mt-2 text-xl font-semibold">Alert controls</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Run a patient-free device test, or archive only stale alerts. Neither action sends WhatsApp messages.
        </p>
      </div>
      <nav className="flex flex-wrap gap-2">
        <button 
          className={`${buttonBase} border border-primary/20 bg-white text-primary hover:bg-primary/5`} 
          onClick={testMobileAlert} 
          disabled={working!==null}
        >
          <BellRing size={16}/>{working==="mobile-alert-test"?"Sending test…":"Send test alert"}
        </button>
        <button 
          className={`${buttonBase} border border-border bg-white text-foreground hover:bg-muted`} 
          onClick={archiveHistoricalAlerts} 
          disabled={working!==null}
        >
          <ClipboardCheck size={16}/>{working==="archive-historical-alerts"?"Archiving…":"Archive history"}
        </button>
      </nav>
    </section>
  );
}
