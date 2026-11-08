"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertOctagon } from "lucide-react";

export default function OemRolloutPage() {
  const [canaryPercentage, setCanaryPercentage] = useState<number>(25);
  const [haltOutbound, setHaltOutbound] = useState(false);
  const [pauseWorkers, setPauseWorkers] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleSaveRollout() {
    setFeedback(`Canary rollout set to ${canaryPercentage}%. Circuit breakers saved.`);
    setTimeout(() => setFeedback(null), 4000);
  }

  function toggleHaltOutbound() {
    if (!haltOutbound) {
      if (!confirm("⚠️ EMERGENCY: Are you sure you want to HALT ALL OUTBOUND MESSAGES? This will immediately prevent any WhatsApp messages from leaving the platform.")) return;
    }
    setHaltOutbound(!haltOutbound);
    setFeedback(!haltOutbound ? "HALT ALL OUTBOUND ENGAGED" : "Outbound messaging resumed");
  }

  function togglePauseWorkers() {
    if (!pauseWorkers) {
      if (!confirm("⚠️ EMERGENCY: Pause background message worker queue? Messages will accumulate in queue without dispatching.")) return;
    }
    setPauseWorkers(!pauseWorkers);
    setFeedback(!pauseWorkers ? "Worker queue paused (fail-closed)" : "Worker queue resumed");
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <header>
        <span className="text-[11px] font-bold tracking-widest text-blue-400 uppercase">
          CLUSTER CONFIGURATION
        </span>
        <h1 className="text-3xl font-black tracking-tight text-white mt-1">Rollout Controls & Circuit Breakers</h1>
        <p className="mt-1 text-sm text-slate-400">
          Emergency killswitches, canary deployment percentages, and platform-wide feature gates.
        </p>
      </header>

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-teal-500/20 bg-teal-500/10 px-4 py-3 text-xs font-bold text-teal-300">
          <CheckCircle2 className="size-4" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Emergency Circuit Breakers (S5-12) */}
      <section className="rounded-2xl border border-rose-900/60 bg-rose-950/20 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-rose-900/40 text-rose-400">
            <AlertOctagon className="size-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Emergency Circuit Breakers</h2>
            <p className="text-xs text-rose-300/80">
              Instant platform-level killswitches. Use during upstream Meta outages or security lockdowns.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 pt-2">
          {/* Halt Outbound */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between">
            <div>
              <b className="text-sm font-bold text-white block">Halt Outbound Messages</b>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Immediately drops all outbound WhatsApp Cloud API API requests.
              </p>
            </div>
            <button
              onClick={toggleHaltOutbound}
              className={`mt-4 w-full rounded-lg py-2 text-xs font-bold transition-all ${
                haltOutbound
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              {haltOutbound ? "HALT ACTIVE (Click to Resume)" : "Halt Outbound"}
            </button>
          </div>

          {/* Pause Workers */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between">
            <div>
              <b className="text-sm font-bold text-white block">Pause Worker Queue</b>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Preserves incoming messages safely in database queue without dispatching.
              </p>
            </div>
            <button
              onClick={togglePauseWorkers}
              className={`mt-4 w-full rounded-lg py-2 text-xs font-bold transition-all ${
                pauseWorkers
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              {pauseWorkers ? "WORKERS PAUSED (Click to Resume)" : "Pause Workers"}
            </button>
          </div>

          {/* Concierge Maintenance */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between">
            <div>
              <b className="text-sm font-bold text-white block">Public Booking Halt</b>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Renders maintenance status on public clinic booking landing pages.
              </p>
            </div>
            <button
              onClick={() => setMaintenanceMode(!maintenanceMode)}
              className={`mt-4 w-full rounded-lg py-2 text-xs font-bold transition-all ${
                maintenanceMode
                  ? "bg-amber-600 text-white shadow-lg shadow-amber-600/30"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              {maintenanceMode ? "MAINTENANCE ACTIVE" : "Enable Maintenance"}
            </button>
          </div>
        </div>
      </section>

      {/* Canary Deployment Slider */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Canary Deployment Percentage</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Determines what percentage of tenant clinics receive new experimental agent prompt layers.
            </p>
          </div>
          <span className="text-xl font-black text-teal-400 font-mono">{canaryPercentage}%</span>
        </div>

        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={canaryPercentage}
            onChange={(e) => setCanaryPercentage(Number(e.target.value))}
            className="w-full accent-teal-400 bg-slate-800 h-2 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <span>0% (Stable Production)</span>
            <span>50% (Standard Canary)</span>
            <span>100% (Full Rollout)</span>
          </div>
        </div>

        <button
          onClick={handleSaveRollout}
          className="rounded-xl bg-teal-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-teal-400 transition-colors shadow-lg shadow-teal-500/10"
        >
          Save Rollout Configuration
        </button>
      </section>
    </div>
  );
}
