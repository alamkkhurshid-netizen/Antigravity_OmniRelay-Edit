"use client";

import { CheckCircle2 } from "lucide-react";
import { ClinicAnalyticsResult } from "@/lib/analytics-engine";

interface FunnelAndAutomationProps {
  funnel: ClinicAnalyticsResult["funnel"];
  automation: ClinicAnalyticsResult["automation"];
}

export function FunnelAndAutomation({ funnel, automation }: FunnelAndAutomationProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Booking Funnel Drop-off */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-2">
        <header className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-black tracking-wider text-[#148261] uppercase">
              PATIENT CONVERSION JOURNEY
            </span>
            <h3 className="text-lg font-bold text-slate-900">
              Booking-to-Care Completion Funnel
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            {funnel.booked} Total Inquiries / Bookings
          </span>
        </header>

        <div className="mt-6 space-y-4">
          {/* Step 1: Booked */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span>1. Booked Inquiries</span>
              <span>{funnel.booked} (100%)</span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-[#1b74a3] rounded-full" style={{ width: "100%" }} />
            </div>
          </div>

          {/* Step 2: Confirmed */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span>2. Confirmed Bookings</span>
              <span>
                {funnel.confirmed} ({funnel.confirmationRate}%)
              </span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-[#0d9488] rounded-full transition-all duration-500"
                style={{ width: `${funnel.confirmationRate}%` }}
              />
            </div>
          </div>

          {/* Step 3: Arrived */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span>3. Arrived at Clinic</span>
              <span>
                {funnel.arrived} ({funnel.arrivalRate}% of confirmed)
              </span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-[#148261] rounded-full transition-all duration-500"
                style={{ width: `${funnel.arrivalRate}%` }}
              />
            </div>
          </div>

          {/* Step 4: Completed */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span>4. Completed Consultation</span>
              <span>
                {funnel.completed} ({funnel.completionRate}% of total booked)
              </span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-[#10b981] rounded-full transition-all duration-500"
                style={{ width: `${funnel.completionRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Exceptions bar */}
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 border border-slate-200/60">
          <span className="font-bold text-slate-800">Drop-off details:</span>
          <span>
            <b>{funnel.noShow}</b> No-Shows ({funnel.noShowRate}%)
          </span>
          <span>•</span>
          <span>
            <b>{funnel.cancelled}</b> Cancellations ({funnel.cancellationRate}%)
          </span>
          <span>•</span>
          <span>
            <b>{funnel.rescheduled}</b> Rescheduled
          </span>
        </div>
      </section>

      {/* WhatsApp Automation Reliability Card */}
      <section className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div>
          <header className="border-b border-slate-100 pb-3">
            <span className="text-xs font-black tracking-wider text-[#0284c7] uppercase">
              AUTOMATION HEALTH
            </span>
            <h3 className="text-base font-bold text-slate-900">
              WhatsApp Messaging Delivery
            </h3>
          </header>

          <div className="mt-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Dispatched Reminders</span>
              <b className="text-sm font-bold text-slate-900">
                {automation.totalRemindersDispatched}
              </b>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Delivered Successfully</span>
              <b className="text-sm font-bold text-[#148261]">
                {automation.deliveredCount} ({automation.deliveryRate}%)
              </b>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Read Receipts</span>
              <b className="text-sm font-bold text-[#0284c7]">
                {automation.readCount} ({automation.readRate}%)
              </b>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Failed / Unreachable</span>
              <b className={`text-sm font-bold ${automation.failedCount > 0 ? "text-rose-600" : "text-slate-400"}`}>
                {automation.failedCount}
              </b>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-[#ecfdf5] p-3.5 border border-[#a7f3d0]">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#065f46]">
            <CheckCircle2 className="size-3.5" />
            <span>Verified Staff Efficiency</span>
          </div>
          <p className="mt-1 text-xs text-[#047857]">
            {automation.staffHoursSaved} receptionist hours saved. Replaces manual verification calls at a benchmark of 4 minutes per reminder.
          </p>
        </div>
      </section>
    </div>
  );
}
