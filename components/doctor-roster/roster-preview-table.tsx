"use client";

import { Calendar, Clock, MapPin, Users } from "lucide-react";
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
              <th className="px-3 py-2.5">Doctor</th>
              <th className="px-3 py-2.5">Specialization</th>
              <th className="px-3 py-2.5">Chamber</th>
              <th className="px-3 py-2.5">Shift Days</th>
              <th className="px-3 py-2.5">Timing</th>
              <th className="px-3 py-2.5">Slot</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                <td className="px-3 py-2 font-semibold text-slate-900">
                  {row.doctor_name}
                  {row.contact_phone && (
                    <span className="block text-[11px] font-normal text-slate-500">
                      {row.contact_phone}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                    {row.specialization}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-700 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  {row.chamber}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>{row.weekdaysLabel}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-700 font-mono">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>
                      {row.start_time} - {row.end_time}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-500 font-mono">
                  {row.slot_duration_minutes}m
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
