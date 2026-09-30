"use client";

import { ClinicAnalyticsResult } from "@/lib/analytics-engine";

interface DoctorPerformanceMatrixProps {
  doctorSummaries: ClinicAnalyticsResult["doctorSummaries"];
}

export function DoctorPerformanceMatrix({ doctorSummaries }: DoctorPerformanceMatrixProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <span className="text-xs font-black tracking-wider text-[#148261] uppercase">
            MULTI-DOCTOR LOAD
          </span>
          <h3 className="text-base font-bold text-slate-900">
            Doctor Capacity, Punctuality & Revenue
          </h3>
        </div>
        <span className="text-xs font-medium text-slate-500">
          {doctorSummaries.length} doctors registered
        </span>
      </header>

      {doctorSummaries.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">
          No doctor appointments recorded for this timeframe.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Doctor</th>
                <th className="px-4 py-3.5 text-center">Bookings</th>
                <th className="px-4 py-3.5 text-center">Completed</th>
                <th className="px-4 py-3.5 text-center">No-Shows</th>
                <th className="px-4 py-3.5 text-center">Completion %</th>
                <th className="px-4 py-3.5 text-center">Avg Wait Time</th>
                <th className="px-6 py-3.5 text-right">Est. Collections</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {doctorSummaries.map((doc) => (
                <tr key={doc.resourceId} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    {doc.doctorName}
                  </td>
                  <td className="px-4 py-4 text-center font-medium">
                    {doc.totalBookings}
                  </td>
                  <td className="px-4 py-4 text-center text-[#148261] font-bold">
                    {doc.completedCount}
                  </td>
                  <td className="px-4 py-4 text-center font-medium text-amber-700">
                    {doc.noShowCount}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-800">
                      {doc.completionRate}%
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`font-semibold ${doc.avgWaitTimeMinutes > 20 ? "text-rose-600" : "text-slate-700"}`}>
                      {doc.avgWaitTimeMinutes} mins
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-slate-900">
                    ₹{(doc.estimatedRevenuePaise / 100).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
