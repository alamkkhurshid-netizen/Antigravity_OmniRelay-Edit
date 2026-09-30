"use client";

import { DoctorRosterImportModal } from "@/components/doctor-roster-import-modal";
import { WorkspaceHero } from "@/components/workspace-hero";
import { RosterMetrics } from "@/components/clinic-operations/roster-metrics";
import { LiveRoster } from "@/components/clinic-operations/live-roster";
import { VisitingConsultants } from "@/components/clinic-operations/visiting-consultants";
import { DoctorImportPanel } from "@/components/clinic-operations/doctor-import-panel";
import { useClinicOperations } from "./use-clinic-operations";

export function ClinicOperationsWorkspace({ today }: { today: string }) {
  const state = useClinicOperations(today);

  return (
    <div className="mx-auto grid max-w-7xl gap-5 pb-12">
      <WorkspaceHero
        tag="WORKSPACE / CLINIC OPERATIONS"
        title={<>{state.dayInfo.isToday ? "Today" : state.dayInfo.weekdayName}, {state.dayInfo.formatted}</>}
        subtitle="Manage your rosters, bookings, and clinic resources across all branches."
        action={
          <div className="flex flex-wrap items-center gap-3 z-10">
            <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-1 shadow-sm backdrop-blur-md">
              <button
                type="button"
                onClick={() => state.changeDay(-1)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                Previous
              </button>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <button
                type="button"
                onClick={() => state.setDate(today)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  state.date === today
                    ? "bg-teal-500/20 text-teal-300 font-semibold"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                Today
              </button>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <button
                type="button"
                onClick={() => state.changeDay(1)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                Next
              </button>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <div className="flex items-center px-2">
                <input
                  type="date"
                  value={state.date}
                  onChange={(event) => state.setDate(event.target.value)}
                  className="text-xs font-medium text-slate-300 bg-transparent outline-none cursor-pointer [color-scheme:dark]"
                />
              </div>
            </div>

            <select
              value={state.departmentFilter}
              onChange={(event) => state.setDepartmentFilter(event.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-300 shadow-sm outline-none focus:ring-2 focus:ring-teal-500/50 transition-all cursor-pointer backdrop-blur-md"
            >
              <option value="" className="bg-slate-900">All departments</option>
              {state.departments.map((item) => (
                <option key={item} className="bg-slate-900">{item}</option>
              ))}
            </select>
            
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-300 shadow-sm hover:bg-white/10 transition-colors backdrop-blur-md"
              onClick={state.runPreDispatchCheck}
            >
              Pre-dispatch check
            </button>

            <DoctorRosterImportModal
              triggerClassName="inline-flex items-center justify-center rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 px-4 py-2 text-sm font-bold shadow-sm hover:bg-teal-500/30 transition-all focus:ring-2 focus:ring-teal-500/50 focus:ring-offset-1 focus:ring-offset-slate-900"
              triggerLabel="Upload Roster"
              onSuccess={() => state.loadRoster()}
            />
          </div>
        }
      />

      {/* View Switcher Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => state.setActiveTab("roster")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              state.activeTab === "roster"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
            }`}
          >
            <span>📅 Visiting Roster for {state.dayInfo.weekdayName}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
                state.activeTab === "roster"
                  ? "bg-teal-400 text-slate-950"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {new Set(state.visibleRoster.map((r) => r.doctor)).size} Doctors ({state.visibleRoster.length} Shifts)
            </span>
          </button>

          <button
            type="button"
            onClick={() => state.setActiveTab("consultants")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              state.activeTab === "consultants"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
            }`}
          >
            <span>👥 All Registered Visiting Consultants</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
                state.activeTab === "consultants"
                  ? "bg-teal-400 text-slate-950"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {state.consultants.length} Doctors Registered
            </span>
          </button>
        </div>

        {state.activeTab === "roster" ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span>Roster Date:</span>
            <span className="rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-teal-800 font-bold">
              {state.dayInfo.weekdayName}, {state.dayInfo.formatted} {state.dayInfo.isToday ? "(Today)" : ""}
            </span>
          </div>
        ) : (
          <div className="text-xs font-semibold text-slate-500">
            Showing all <b>{state.consultants.length}</b> visiting consultants associated with this clinic
          </div>
        )}
      </div>

      {state.preflightMessage && state.activeTab === "roster" && (
        <p className="form-message" role="status">
          {state.preflightMessage}
        </p>
      )}

      {state.activeTab === "roster" && (
        <>
          <RosterMetrics
            dayInfo={state.dayInfo}
            visibleRoster={state.visibleRoster}
            totals={state.totals}
            alerts={state.alerts}
          />
          <LiveRoster
            visibleRoster={state.visibleRoster}
            loading={state.loading}
            updated={state.updated}
            queueBusy={state.queueBusy}
            consentRow={state.consentRow}
            consentChecked={state.consentChecked}
            queueMessage={state.queueMessage}
            dayInfo={state.dayInfo}
            sendQueue={state.sendQueue}
            setQueue={state.setQueue}
            setConsentRow={state.setConsentRow}
            setConsentChecked={state.setConsentChecked}
          />
        </>
      )}

      {state.activeTab === "consultants" && (
        <VisitingConsultants
          filteredConsultants={state.filteredConsultants}
          visibleRoster={state.visibleRoster}
          searchQuery={state.searchQuery}
          setSearchQuery={state.setSearchQuery}
          jumpToShiftDay={state.jumpToShiftDay}
          dayInfo={state.dayInfo}
        />
      )}

      <DoctorImportPanel 
        rows={state.rows}
        setRows={state.setRows}
        preview={state.preview}
        setPreview={state.setPreview}
        message={state.message}
        setMessage={state.setMessage}
        busy={state.busy}
        validate={state.validate}
        download={state.download}
      />
    </div>
  );
}
