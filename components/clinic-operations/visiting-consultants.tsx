import React from "react";
import { RegisteredConsultant, RosterRow } from "@/app/app/clinic-operations/types";

export function VisitingConsultants({
  filteredConsultants,
  visibleRoster,
  searchQuery,
  setSearchQuery,
  jumpToShiftDay,
  dayInfo,
}: {
  filteredConsultants: RegisteredConsultant[];
  visibleRoster: RosterRow[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  jumpToShiftDay: (weekday: number) => void;
  dayInfo: { weekdayName: string };
}) {
  return (
    <section className="grid gap-5">
      {filteredConsultants.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          <p className="text-base font-bold text-slate-700">
            No visiting consultants match &ldquo;{searchQuery}&rdquo;
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="mt-3 text-xs font-bold text-teal-600 hover:underline"
          >
            Clear search filter
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredConsultants.map((doc) => {
            const isVisitingOnSelectedDate = visibleRoster.some(
              (r) => r.doctor.toLowerCase() === doc.name.toLowerCase()
            );
            return (
              <article
                key={doc.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-400 to-blue-500" />
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {doc.name}
                      </h3>
                      <span className="inline-block mt-1 rounded-md bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-700 border border-teal-200">
                        {doc.specialization}
                      </span>
                    </div>
                    {isVisitingOnSelectedDate ? (
                      <span className="rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 text-[11px] font-extrabold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Visiting {dayInfo.weekdayName.slice(0, 3)}
                      </span>
                    ) : (
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {doc.chambers[0] || "Chamber"}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">📞 Phone:</span>
                      <span className="font-semibold text-slate-800">
                        {doc.phone || (
                          <em className="text-slate-400">Not recorded</em>
                        )}
                      </span>
                      {doc.queueEnabled && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                          WhatsApp Active
                        </span>
                      )}
                    </div>
                    {doc.email && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">✉️ Email:</span>
                        <span className="font-medium text-slate-700 truncate">
                          {doc.email}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">🏥 Chamber(s):</span>
                      <span className="font-medium text-slate-800">
                        {doc.chambers.join(", ")}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Weekly Recurring Shifts ({doc.shifts.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {doc.shifts.length === 0 ? (
                        <span className="text-xs text-slate-400 italic">
                          No recurring shift days configured
                        </span>
                      ) : (
                        doc.shifts.map((shift) => (
                          <button
                            key={shift.id}
                            type="button"
                            onClick={() => jumpToShiftDay(shift.weekday)}
                            className="group flex items-center gap-1.5 rounded-lg bg-slate-50 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 px-2.5 py-1.5 text-xs transition-colors text-left"
                            title={`Jump to next ${shift.dayLabel} roster`}
                          >
                            <b className="text-slate-900 group-hover:text-teal-800">
                              {shift.dayLabel}
                            </b>
                            <span className="text-slate-600">
                              {shift.startTime}–{shift.endTime}
                            </span>
                            <span className="text-[10px] text-teal-700 font-semibold">
                              ({shift.chamber})
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">
                    {doc.shifts.length} weekly recurring session
                    {doc.shifts.length === 1 ? "" : "s"}
                  </span>
                  {doc.shifts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => jumpToShiftDay(doc.shifts[0].weekday)}
                      className="text-xs font-bold text-teal-600 hover:text-teal-700 hover:underline"
                    >
                      View {doc.shifts[0].dayLabel} Roster ➔
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
