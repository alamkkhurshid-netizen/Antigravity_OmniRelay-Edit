"use client";

import { useState, useRef } from "react";
import { Upload, Download, FileText, CheckCircle2, AlertCircle, Loader2, X, Users, Calendar, Clock, MapPin } from "lucide-react";

type ParsedDoctorRow = {
  doctor_name: string;
  specialization: string;
  department?: string;
  contact_phone: string;
  contact_email: string;
  chamber: string;
  weekdays: number[];
  weekdaysLabel: string;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SAMPLE_CSV_CONTENT = `doctor_name,specialization,contact_phone,contact_email,chamber,weekdays,start_time,end_time,slot_duration_minutes
Dr Asha Sen,Cardiology,+919900001001,asha@example.com,Chamber 1,1|3|5,12:00,16:00,20
Dr Vikram Mehta,Neurology,+919900001002,vikram@example.com,Chamber 2,2|4|6,10:00,14:00,30
Dr Sneha Roy,Pediatrics,+919900001003,sneha@example.com,Chamber 1,1|2|3|4|5,09:00,13:00,15
`;

export function DoctorRosterImportModal({ 
  triggerClassName, 
  triggerLabel = "Bulk Import Doctors (CSV)",
  onSuccess 
}: { 
  triggerClassName?: string;
  triggerLabel?: string;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedDoctorRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_CSV_CONTENT], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "doctor_roster_sample.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parseCsvText = (text: string): ParsedDoctorRow[] => {
    const records: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (char === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        if (row.some(Boolean)) records.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
    row.push(field);
    if (row.some(Boolean)) records.push(row);

    if (records.length < 2) {
      throw new Error("CSV file must contain a header row and at least one doctor row.");
    }

    const headers = (records.shift() ?? []).map((item) => item.trim().toLowerCase());
    const required = [
      "doctor_name",
      "specialization",
      "contact_phone",
      "contact_email",
      "chamber",
      "weekdays",
      "start_time",
      "end_time",
      "slot_duration_minutes",
    ];

    const missing = required.filter((key) => !headers.includes(key));
    if (missing.length > 0) {
      throw new Error(`Missing required columns in CSV: ${missing.join(", ")}`);
    }

    return records.map((values, index) => {
      const get = (key: string) => String(values[headers.indexOf(key)] ?? "").trim();
      
      const doctorName = get("doctor_name");
      if (!doctorName) {
        throw new Error(`Row ${index + 2}: doctor_name is required.`);
      }

      const rawWeekdays = get("weekdays")
        .split(/[|;,/]/)
        .map((item) => Number(item.trim()))
        .filter((num) => !isNaN(num) && num >= 0 && num <= 6);

      const weekdaysLabel = rawWeekdays.map((dayNum) => DAY_NAMES[dayNum] ?? "").filter(Boolean).join(", ");

      return {
        doctor_name: doctorName,
        specialization: get("specialization") || "General",
        department: headers.includes("department") ? get("department") : undefined,
        contact_phone: get("contact_phone"),
        contact_email: get("contact_email"),
        chamber: get("chamber") || "Chamber 1",
        weekdays: rawWeekdays.length > 0 ? rawWeekdays : [1, 2, 3, 4, 5],
        weekdaysLabel: weekdaysLabel || "Mon - Fri",
        start_time: get("start_time") || "09:00",
        end_time: get("end_time") || "17:00",
        slot_duration_minutes: Number(get("slot_duration_minutes")) || 20,
      };
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError(null);
    setStatusMessage(null);

    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      setRows(parsed);
    } catch (err: any) {
      setRows([]);
      setParseError(err.message || "Failed to parse CSV file.");
    }
  };

  const handleImportSubmit = async () => {
    if (rows.length === 0) return;
    setSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/clinic-operations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: rows.map((r) => ({
            doctor_name: r.doctor_name,
            specialization: r.specialization,
            department: r.department || r.specialization,
            contact_phone: r.contact_phone,
            contact_email: r.contact_email,
            chamber: r.chamber,
            weekdays: r.weekdays,
            start_time: r.start_time,
            end_time: r.end_time,
            slot_duration_minutes: r.slot_duration_minutes,
          })),
          commit: true,
          sourceFormat: "csv",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatusMessage({
          type: "error",
          text: data.error || "Import failed. Please check your data and try again.",
        });
      } else if (data.errors && data.errors.length > 0) {
        setStatusMessage({
          type: "error",
          text: `Import blocked: ${data.errors[0].message} (Row ${data.errors[0].row})`,
        });
      } else {
        setStatusMessage({
          type: "success",
          text: `Success! ${data.imported_count || rows.length} doctor schedule(s) configured successfully.`,
        });
        setTimeout(() => {
          setOpen(false);
          setRows([]);
          setFileName("");
          onSuccess?.();
          window.location.reload();
        }, 1500);
      }
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to communicate with import server.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName || "inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700 transition-colors"}
      >
        <Upload className="size-4" /> {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <Users className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Bulk Doctor Roster Setup</h2>
                  <p className="text-xs text-slate-500">Auto-configure doctors, chambers, and recurring weekly shifts via CSV</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Instructions and Sample Download Card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-teal-900 flex items-center gap-1.5">
                    <FileText className="size-4 text-teal-600" /> Need the standard CSV template?
                  </h3>
                  <p className="text-xs text-teal-800 leading-relaxed">
                    Download the pre-formatted template with sample doctor rows. Weekdays are formatted as numbers (0=Sun, 1=Mon, ..., 6=Sat).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-xs font-bold text-teal-800 shadow-sm ring-1 ring-inset ring-teal-200 hover:bg-teal-50 transition-colors"
                >
                  <Download className="size-4" /> Download Sample CSV
                </button>
              </div>

              {/* Upload Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-teal-500 hover:bg-slate-50/50 transition-all cursor-pointer group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors mb-3">
                  <Upload className="size-6" />
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {fileName ? fileName : "Click to browse or drag and drop your roster CSV"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports up to 200 doctor shifts at once
                </p>
              </div>

              {/* Parsing Errors */}
              {parseError && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 p-4 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Server Status Messages */}
              {statusMessage && (
                <div
                  className={`flex items-start gap-2.5 rounded-xl p-4 text-xs font-medium ${
                    statusMessage.type === "success"
                      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                      : "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
                  }`}
                >
                  {statusMessage.type === "success" ? (
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-rose-600" />
                  )}
                  <span>{statusMessage.text}</span>
                </div>
              )}

              {/* Preview Table */}
              {rows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Roster Preview ({rows.length} shifts found)
                    </h4>
                    <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" /> Ready for setup
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">Doctor</th>
                          <th className="px-4 py-3">Specialization</th>
                          <th className="px-4 py-3">Chamber</th>
                          <th className="px-4 py-3">Days</th>
                          <th className="px-4 py-3">Hours</th>
                          <th className="px-4 py-3">Slot</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                              {row.doctor_name}
                              {row.contact_phone && (
                                <span className="block text-[10px] text-slate-400 font-mono">
                                  {row.contact_phone}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                {row.specialization}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">
                              <span className="flex items-center gap-1">
                                <MapPin className="size-3 text-slate-400" />
                                {row.chamber}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="flex items-center gap-1 font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                                <Calendar className="size-3" />
                                {row.weekdaysLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-700">
                              <span className="flex items-center gap-1">
                                <Clock className="size-3 text-slate-400" />
                                {row.start_time} - {row.end_time}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-medium">
                              {row.slot_duration_minutes}m
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rows.length === 0 || submitting}
                onClick={handleImportSubmit}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-teal-700 disabled:opacity-50 transition-colors min-w-[150px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Provisioning...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" /> Auto-Setup Doctors
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
