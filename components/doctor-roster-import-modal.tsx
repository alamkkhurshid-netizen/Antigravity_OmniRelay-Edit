"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Users,
  FileText,
} from "lucide-react";
import {
  ParsedDoctorRow,
  downloadSampleXlsx,
  downloadSampleCsv,
  parseRosterBuffer,
  RosterPreviewTable,
} from "./doctor-roster/index";

export function DoctorRosterImportModal({
  triggerClassName,
  triggerLabel = "Bulk Import Doctors (Excel / CSV)",
  onSuccess,
}: {
  triggerClassName?: string;
  triggerLabel?: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedDoctorRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError(null);
    setStatusMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseRosterBuffer(buffer);
      setRows(parsed);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setRows([]);
      setParseError(err.message || "Failed to parse file. Ensure it is a valid Excel (.xlsx) or CSV file.");
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
            department: null,
            contact_phone: r.contact_phone,
            contact_email: r.contact_email,
            chamber: r.chamber,
            weekdays: r.weekdays,
            start_time: r.start_time,
            end_time: r.end_time,
            slot_duration_minutes: r.slot_duration_minutes,
          })),
          commit: true,
          sourceFormat: "excel_csv",
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
          text: `Success! ${data.imported_count || rows.length} doctor schedule(s) configured successfully. Missing chambers were automatically created.`,
        });
        setTimeout(() => {
          setOpen(false);
          setRows([]);
          setFileName("");
          onSuccess?.();
          router.refresh();
        }, 1500);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        className={
          triggerClassName ||
          "inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700 transition-colors cursor-pointer"
        }
      >
        <Upload className="size-4" /> {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <Users className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Bulk Doctor Roster Setup</h2>
                  <p className="text-xs text-slate-500">
                    Auto-configure doctors, chambers, and recurring weekly shifts via Excel (.xlsx) or CSV
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
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
                    <FileSpreadsheet className="size-4 text-teal-600" /> Need the standard template?
                  </h3>
                  <p className="text-xs text-teal-800 leading-relaxed">
                    Download the pre-formatted roster template. Contains all fields: doctor_name, specialization, phone,
                    email, chamber, weekdays, start_time, end_time, slot_duration_minutes.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={downloadSampleXlsx}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-800 transition-colors cursor-pointer"
                  >
                    <Download className="size-3.5" /> Download Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={downloadSampleCsv}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-teal-800 shadow-sm ring-1 ring-inset ring-teal-200 hover:bg-teal-50 transition-colors cursor-pointer"
                  >
                    <FileText className="size-3.5" /> CSV
                  </button>
                </div>
              </div>

              {/* Upload Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-teal-500 hover:bg-slate-50/50 transition-all cursor-pointer group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors mb-3">
                  <Upload className="size-6" />
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {fileName ? fileName : "Click to browse or drag and drop your roster (Excel .xlsx or CSV)"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports up to 200 doctor shifts at once
                </p>
              </div>

              {/* Parsing Errors */}
              {parseError && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 p-4 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                  <AlertCircle className="size-4 shrink-0 text-rose-600 mt-0.5" />
                  <div>{parseError}</div>
                </div>
              )}

              {/* Status Message */}
              {statusMessage && (
                <div
                  className={`flex items-start gap-2.5 rounded-xl p-4 text-xs font-medium ${
                    statusMessage.type === "success"
                      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                      : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                  }`}
                >
                  {statusMessage.type === "success" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="size-4 shrink-0 text-rose-600 mt-0.5" />
                  )}
                  <div>{statusMessage.text}</div>
                </div>
              )}

              {/* Roster Preview */}
              <RosterPreviewTable rows={rows} />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rows.length === 0 || submitting}
                onClick={handleImportSubmit}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Provisioning Chambers & Doctors...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" /> Auto-Setup Doctors ({rows.length})
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
