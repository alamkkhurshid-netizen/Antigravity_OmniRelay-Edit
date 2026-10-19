"use client";

import React, { useState } from "react";
import { PowerOff, CheckCircle, Calendar, UserCheck, RotateCcw } from "lucide-react";
import { 
  suspendTenant, 
  reactivateTenant, 
  extendTenantTrial, 
  resetTenantOnboarding, 
  toggleSupportImpersonation 
} from "@/app/oem/tenants/actions";

export function TenantDetailActions({
  organizationId,
  organizationName,
  isSuspended,
  trialEndsAt: _trialEndsAt,
}: {
  organizationId: string;
  organizationName: string;
  isSuspended: boolean;
  trialEndsAt?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [suspendedState, setSuspendedState] = useState(isSuspended);

  async function handleToggleSuspend() {
    const confirmMsg = suspendedState
      ? `Reactivate workspace for "${organizationName}"?`
      : `Are you sure you want to SUSPEND "${organizationName}"? This immediately blocks all outbound messages and concierge booking.`;

    if (!confirm(confirmMsg)) return;

    setBusy(true);
    try {
      if (suspendedState) {
        await reactivateTenant(organizationId);
        setSuspendedState(false);
      } else {
        await suspendTenant(organizationId, "Operator administrative hold");
        setSuspendedState(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleExtendTrial() {
    const daysStr = prompt(`Extend trial for "${organizationName}" by how many days?`, "14");
    if (!daysStr) return;
    const days = parseInt(daysStr, 10);
    if (isNaN(days) || days <= 0) return;

    setBusy(true);
    try {
      await extendTenantTrial(organizationId, days);
      alert(`Trial successfully extended by ${days} days.`);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleResetOnboarding() {
    if (!confirm(`Reset onboarding lock for "${organizationName}"? This allows clinic admins to re-enter the setup wizard.`)) return;
    setBusy(true);
    try {
      await resetTenantOnboarding(organizationId);
      alert("Onboarding lock reset successfully.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImpersonate() {
    if (!confirm(`Launch support impersonation mode for "${organizationName}"? You will view their workspace in read-only mode.`)) return;
    setBusy(true);
    try {
      await toggleSupportImpersonation(organizationId, true);
      window.location.assign("/app");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        onClick={handleImpersonate}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3.5 py-2 text-xs font-bold text-blue-400 hover:bg-blue-500/20 transition-all shadow-sm disabled:opacity-50"
      >
        <UserCheck className="size-3.5" />
        Impersonate (Read-only)
      </button>

      <button
        onClick={handleExtendTrial}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm disabled:opacity-50"
      >
        <Calendar className="size-3.5 text-amber-400" />
        Extend Trial
      </button>

      <button
        onClick={handleResetOnboarding}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm disabled:opacity-50"
      >
        <RotateCcw className="size-3.5 text-slate-400" />
        Reset Setup
      </button>

      <button
        onClick={handleToggleSuspend}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-sm disabled:opacity-50 ${
          suspendedState
            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            : "border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
        }`}
      >
        {suspendedState ? (
          <>
            <CheckCircle className="size-3.5" />
            Reactivate Organization
          </>
        ) : (
          <>
            <PowerOff className="size-3.5" />
            Suspend Organization
          </>
        )}
      </button>
    </div>
  );
}
