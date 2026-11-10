import React from "react";
import { RosterRow, OpsAlert } from "@/app/app/clinic-operations/types";

export function RosterMetrics({
  dayInfo,
  visibleRoster,
  totals,
  alerts,
}: {
  dayInfo: { weekdayName: string; formatted: string; isToday: boolean };
  visibleRoster: RosterRow[];
  totals: {
    capacity: number;
    booked: number;
    empty: number;
    arrived: number;
    completed: number;
  };
  alerts: OpsAlert[];
}) {
  return (
    <>
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <article className="or-trademark-card flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs transition hover:border-slate-300">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Doctors visiting ({dayInfo.weekdayName.slice(0, 3)})</span>
          <b className="mt-2 block text-2xl font-bold tracking-tight text-slate-900">{new Set(visibleRoster.map((row) => row.doctor)).size}</b>
          <small className="mt-0.5 block text-[11px] font-medium text-slate-600">
            {visibleRoster.length} scheduled session
            {visibleRoster.length === 1 ? "" : "s"}
          </small>
        </article>
        <article className="or-trademark-card flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs transition hover:border-slate-300">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Booked</span>
          <b className="mt-2 block text-2xl font-bold tracking-tight text-slate-900">
            {totals.booked}/{totals.capacity}
          </b>
          <small className="mt-0.5 block text-[11px] font-medium text-slate-600">Appointments / capacity</small>
        </article>
        <article className="or-trademark-card flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs transition hover:border-slate-300">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Empty slots</span>
          <b className="mt-2 block text-2xl font-bold tracking-tight text-slate-900">{totals.empty}</b>
          <small className="mt-0.5 block text-[11px] font-medium text-slate-600">Available capacity</small>
        </article>
        <article className="or-trademark-card flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs transition hover:border-slate-300">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Patient flow</span>
          <b className="mt-2 block text-2xl font-bold tracking-tight text-slate-900">{totals.arrived + totals.completed}</b>
          <small className="mt-0.5 block text-[11px] font-medium text-slate-600">
            {totals.arrived} arrived · {totals.completed} completed
          </small>
        </article>
      </section>

      {alerts.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-rose-200/80 bg-white shadow-2xs">
          <header className="flex items-center justify-between border-b border-rose-100 bg-rose-50/70 px-4 py-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-rose-800">ACTION REQUIRED</span>
              <h3 className="mt-0.5 text-sm font-bold text-slate-900">Roster and queue exceptions</h3>
            </div>
            <span className="grid size-6 place-items-center rounded-md bg-rose-100 text-xs font-bold text-rose-800 border border-rose-300/60">
              {alerts.length}
            </span>
          </header>
          <div className="divide-y divide-rose-100/60 p-1">
            {alerts.map((alert) => (
              <article className="flex items-start gap-3 p-3 transition hover:bg-rose-50/30" key={alert.key}>
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-rose-100 text-xs font-bold text-rose-800 border border-rose-200">
                  !
                </span>
                <div className="flex flex-col gap-0.5">
                  <b className="text-xs font-bold text-slate-900">{alert.title}</b>
                  <span className="text-[11px] font-medium text-slate-600">{alert.detail}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}