"use client";

import { Download } from "lucide-react";
import { DateRangeKey, DoctorResource } from "@/lib/analytics-engine";
import { WhatsAppLiveCounter } from "@/app/app/analytics/whatsapp-live-counter";

interface ExecutiveHeaderProps {
  clinicName: string;
  organizationId: string;
  initialWhatsappCounts: { messages: number; estimatedCostPaise: number };
  range: DateRangeKey;
  handleRangeChange: (val: DateRangeKey) => void;
  selectedDoctor: string;
  handleDoctorChange: (val: string) => void;
  doctors: DoctorResource[];
  downloadCsv: () => void;
}

export function ExecutiveHeader({
  clinicName, organizationId, initialWhatsappCounts,
  range, handleRangeChange, selectedDoctor, handleDoctorChange,
  doctors, downloadCsv
}: ExecutiveHeaderProps) {
  return (
    <section className="relative flex flex-col gap-6 overflow-hidden rounded-2xl bg-slate-950 px-6 py-8 text-white shadow-xl md:flex-row md:items-center md:justify-between isolate">
      {/* Ambient Orbs & Grain */}
      <div className="absolute -top-32 -right-32 h-[30rem] w-[30rem] rounded-full bg-teal-500/20 blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 h-[30rem] w-[30rem] rounded-full bg-blue-600/20 blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none -z-10" />

      <div className="z-10 max-w-2xl">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-teal-400 ring-1 ring-inset ring-teal-500/20 uppercase">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-500"></span>
            </span>
            CLINIC INTELLIGENCE & VALUE ENGINE
          </span>
          <span className="text-[10px] font-medium tracking-wide text-slate-400">Stage 14A-14E Architecture</span>
        </div>
        <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-100 to-slate-400 leading-[1.15]">
          {clinicName} Operations & Value Analytics
        </h1>
        <p className="mt-4 text-sm sm:text-base text-slate-400 font-medium tracking-wide">
          Verified operational facts, queue delay benchmarks, and automated staff time savings.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 z-10">
        <WhatsAppLiveCounter 
          organizationId={organizationId} 
          initialCounts={initialWhatsappCounts} 
        />

        <div className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 p-1 text-[13px] font-bold shadow-sm backdrop-blur-md">
          {(
            [
              ["today", "Today"],
              ["7d", "7 Days"],
              ["30d", "30 Days"],
              ["month", "This Month"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleRangeChange(key)}
              className={`rounded-lg px-3 py-1.5 transition-all ${
                range === key
                  ? "bg-white/15 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={selectedDoctor}
          onChange={(e) => handleDoctorChange(e.target.value)}
          aria-label="Filter by doctor"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-white/10 border border-white/10 px-4 text-[13px] font-bold text-white shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-1 focus:ring-teal-500/50 cursor-pointer"
        >
          <option value="all" className="bg-slate-900 text-white">
            All Doctors ({doctors.length})
          </option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id} className="bg-slate-900 text-white">
              {d.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={downloadCsv}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-400 to-blue-500 px-4 text-[13px] font-bold text-slate-950 shadow-[0_0_20px_rgba(45,212,191,0.25)] transition-all hover:from-teal-300 hover:to-blue-400 hover:scale-[1.02]"
        >
          <Download className="size-3.5" />
          <span>Export CSV</span>
        </button>
      </div>
    </section>
  );
}
