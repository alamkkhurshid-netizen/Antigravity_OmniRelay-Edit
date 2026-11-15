"use client";

import { Calendar, Clock, MapPin, Users, Award, ShieldCheck, Banknote } from "lucide-react";
import { ParsedDoctorRow } from "./roster-parser";

export interface RosterPreviewTableProps {
  rows: ParsedDoctorRow[];
}

export function RosterPreviewTable({ rows }: RosterPreviewTableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Users className="w-4 h-4 text-[#087fb9]" />
          Parsed Doctor Records ({rows.length})
        </h4>
        <span className="text-xs text-slate-500">Preview before import</span>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2.5">Doctor & Credentials</th>
              <th className="px-3 py-2.5">Dept / Specialty</th>
              <th className="px-3 py-2.5">Chamber</th>
              <th className="px-3 py-2.5">Shift Days</th>
              <th className="px-3 py-2.5">Timing</th>
              <th className="px-3 py-2.5">Fee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                <td className="px-3 py-2 font-semibold text-slate-900">
                  <div className="text-sm text-slate-900">{row.doctor_name}</div>
                  {row.qualifications && (
                    <div className="text-[11px] font-normal text-slate-600 flex items-center gap-1 mt-0.5">
                      <Award className="w-3 h-3 text-amber-500 inline shrink-0" />
                      <span className="truncate max-w-[200px]" title={row.qualifications}>{row.qualifications}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-normal mt-0.5">
                    {row.registration_number && (
                      <span className="flex items-center gap-0.5 text-slate-500">
                        <ShieldCheck className="w-2.5 h-2.5 text-teal-600" />
                        {row.registration_number}
                      </span>
                    )}
                    {row.experience_years !== null && row.experience_years !== undefined && (
                      <span>{row.experience_years} yrs exp</span>
                    )}
                    {row.contact_phone && (
                      <span>{row.contact_phone}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium text-[11px]">
                    {row.specialization}
                  </span>
                  {row.department && row.department !== row.specialization && (
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      Dept: {row.department}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  <div className="flex items-center gap-1 font-medium">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{row.chamber}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-700">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{row.weekdaysLabel}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-700 font-mono">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>
                      {row.start_time} - {row.end_time}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">{row.slot_duration_minutes}m slots</span>
                </td>
                <td className="px-3 py-2 text-slate-700 font-medium">
                  {row.consultation_fee ? (
                    <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                      <Banknote className="w-3 h-3" />
                      ₹{row.consultation_fee}
                    </span>
                  ) : (
                    <span className="text-slate-400 text-[11px]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
