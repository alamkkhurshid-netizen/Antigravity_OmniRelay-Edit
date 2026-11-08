"use client";

import React, { useState, useMemo } from "react";
import { Search, Download } from "lucide-react";

export interface AuditEventRow {
  id: string;
  actor_user_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function OemAuditTable({ initialEvents }: { initialEvents: AuditEventRow[] }) {
  const [events] = useState<AuditEventRow[]>(initialEvents);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const matchesSearch =
        e.event_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.actor_user_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        JSON.stringify(e.metadata).toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter = filterType === "all" || e.event_type === filterType;

      return matchesSearch && matchesFilter;
    });
  }, [events, searchQuery, filterType]);

  const uniqueEventTypes = Array.from(new Set(events.map((e) => e.event_type)));

  function exportAuditCsv() {
    const headers = ["Event ID", "Actor User ID", "Event Type", "Timestamp", "Metadata"];
    const rows = filteredEvents.map((e) => [
      `"${e.id}"`,
      `"${e.actor_user_id}"`,
      `"${e.event_type}"`,
      `"${e.created_at}"`,
      `"${JSON.stringify(e.metadata).replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `oem_audit_log_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search audit events, actor IDs, metadata..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-teal-400"
          >
            <option value="all">All Event Types</option>
            {uniqueEventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={exportAuditCsv}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-all shadow-sm"
        >
          <Download className="size-3.5 text-teal-400" />
          Export Audit CSV
        </button>
      </div>

      {/* Events Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Timestamp</th>
                <th className="px-4 py-3.5">Event Type</th>
                <th className="px-4 py-3.5">Operator Actor</th>
                <th className="px-5 py-3.5">Payload & Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono text-xs">
              {filteredEvents.map((evt) => (
                <tr key={evt.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 text-slate-400 whitespace-nowrap">
                    {new Date(evt.created_at).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex rounded-md bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-400">
                      {evt.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-300">
                    <span title={evt.actor_user_id}>{evt.actor_user_id.slice(0, 12)}...</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 max-w-md truncate">
                    <code>{JSON.stringify(evt.metadata)}</code>
                  </td>
                </tr>
              ))}

              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500 font-sans">
                    No matching audit logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
