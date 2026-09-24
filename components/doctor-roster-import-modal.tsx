"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X, Users, Calendar, Clock, MapPin, FileText } from "lucide-react";

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

const DAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0, "0": 0, "7": 0,
  mon: 1, monday: 1, "1": 1,
  tue: 2, tuesday: 2, "2": 2,
  wed: 3, wednesday: 3, "3": 3,
  thu: 4, thursday: 4, "4": 4,
  fri: 5, friday: 5, "5": 5,
  sat: 6, saturday: 6, "6": 6,
};

const SAMPLE_DOCTOR_DATA = [
  {
    doctor_name: "Dr Ananya Bose",
    specialization: "Neonatology",
    contact_phone: "+919900001101",
    contact_email: "ananya.bose@example.com",
    chamber: "Chamber 1",
    weekdays: "1|3|5",
    start_time: "09:00",
    end_time: "13:00",
    slot_duration_minutes: 20,
  },
  {
    doctor_name: "Dr Rohan Mukherjee",
    specialization: "Pediatrics",
    contact_phone: "+919900001102",
    contact_email: "rohan.mukherjee@example.com",
    chamber: "Chamber 2",
    weekdays: "2|4",
    start_time: "10:00",
    end_time: "14:00",
    slot_duration_minutes: 20,
  },
  {
    doctor_name: "Dr Ishita Sen",
    specialization: "Neonatology",
    contact_phone: "+919900001103",
    contact_email: "ishita.sen@example.com",
    chamber: "Chamber 3",
    weekdays: "1|4",
    start_time: "15:00",
    end_time: "19:00",
    slot_duration_minutes: 20,
  },
  {
    doctor_name: "Dr Arindam Ghosh",
    specialization: "Pediatrics",
    contact_phone: "+919900001104",
    contact_email: "arindam.ghosh@example.com",
    chamber: "Chamber 4",
    weekdays: "2|5",
    start_time: "09:30",
    end_time: "13:30",
    slot_duration_minutes: 20,
  },
  {
    doctor_name: "Dr Priyanka Das",
    specialization: "Pediatrics",
    contact_phone: "+919900001105",
    contact_email: "priyanka.das@example.com",
    chamber: "Chamber 5",
    weekdays: "3|6",
    start_time: "11:00",
    end_time: "15:00",
    slot_duration_minutes: 20,
  },
];

const SAMPLE_CSV_CONTENT = `doctor_name,specialization,contact_phone,contact_email,chamber,weekdays,start_time,end_time,slot_duration_minutes
Dr Ananya Bose,Neonatology,+919900001101,ananya.bose@example.com,Chamber 1,1|3|5,09:00,13:00,20
Dr Rohan Mukherjee,Pediatrics,+919900001102,rohan.mukherjee@example.com,Chamber 2,2|4,10:00,14:00,20
Dr Ishita Sen,Neonatology,+919900001103,ishita.sen@example.com,Chamber 3,1|4,15:00,19:00,20
Dr Arindam Ghosh,Pediatrics,+919900001104,arindam.ghosh@example.com,Chamber 4,2|5,09:30,13:30,20
Dr Priyanka Das,Pediatrics,+919900001105,priyanka.das@example.com,Chamber 5,3|6,11:00,15:00,20
`;

export function DoctorRosterImportModal({ 
  triggerClassName, 
  triggerLabel = "Bulk Import Doctors (Excel / CSV)",
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

  // Download Sample Excel (.xlsx) matching user's exact sheet layout
  const handleDownloadSampleXlsx = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Doctor Data
    const wsDoctorData = XLSX.utils.json_to_sheet(SAMPLE_DOCTOR_DATA);
    XLSX.utils.book_append_sheet(wb, wsDoctorData, "Doctor Data");

    // Sheet 2: Notes
    const notesData = [
      { Field: "Data type", Details: "Multi-Doctor OPD Weekly Shift Roster" },
      { Field: "Weekday convention", Details: "1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, 7 or 0=Sunday" },
      { Field: "Multi-day shifts", Details: "Use pipe separator e.g. 1|3|5 for Monday, Wednesday, Friday" },
      { Field: "Chamber auto-creation", Details: "Chambers referenced here (e.g. Chamber 1, Chamber 2) will be auto-created if not already present" },
      { Field: "Time format", Details: "HH:MM 24-hour format e.g. 09:00, 14:30" },
      { Field: "Slot duration", Details: "Duration per appointment in minutes (e.g. 15, 20, 30)" },
    ];
    const wsNotes = XLSX.utils.json_to_sheet(notesData);
    XLSX.utils.book_append_sheet(wb, wsNotes, "Notes");

    XLSX.writeFile(wb, "Doctor_Roster_Template.xlsx");
  };

  // Download Sample CSV
  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV_CONTENT], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Doctor_Roster_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parseRosterBuffer = (buffer: ArrayBuffer): ParsedDoctorRow[] => {
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
    
    // Locate the doctor data sheet: either named 'Doctor Data', 'Doctors', 'Roster', or the first sheet
    const targetSheetName = wb.SheetNames.find((n) => /doctor|roster|data/i.test(n)) || wb.SheetNames[0];
    if (!targetSheetName || !wb.Sheets[targetSheetName]) {
      throw new Error("No readable worksheet found in the uploaded file.");
    }

    const rawRecords = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[targetSheetName], { raw: false });
    if (!rawRecords || rawRecords.length === 0) {
      throw new Error(`The sheet '${targetSheetName}' does not contain any doctor data rows.`);
    }

    return rawRecords.map((raw, idx) => {
      // Normalize all field keys (lowercase, remove spaces/dashes)
      const row: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        const cleanKey = k.toLowerCase().trim().replace(/[\s\-_]+/g, "_");
        row[cleanKey] = typeof v === "string" ? v.trim() : String(v ?? "").trim();
      }

      const doctorName = row.doctor_name || row.doctor || row.name || row.physician || "";
      if (!doctorName) {
        throw new Error(`Row ${idx + 2}: Doctor name is required.`);
      }

      const specialization = row.specialization || row.specialty || row.specialisation || "General";
      const department = row.department || specialization;

      let contactPhone = row.contact_phone || row.phone || row.mobile || row.contact || "";
      if (contactPhone) {
        const digits = contactPhone.replace(/[^0-9]/g, "");
        if (digits.length === 10) {
          contactPhone = "+91" + digits;
        } else if (digits.length === 12 && digits.startsWith("91")) {
          contactPhone = "+" + digits;
        } else if (!contactPhone.startsWith("+") && digits.length >= 8) {
          contactPhone = "+" + digits;
        }
      }

      const contactEmail = (row.contact_email || row.email || "").toLowerCase();
      const chamber = row.chamber || row.chamber_name || row.room || row.location || "Chamber 1";

      // Parse weekdays: handles 1|3|5, 1,3,5, or Mon, Wed, Fri
      const rawWeekdaysStr = row.weekdays || row.days || row.day || "1|2|3|4|5";
      const parts = rawWeekdaysStr.split(/[|,;/]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      const parsedWeekdays = parts
        .map((p) => {
          if (/^[0-7]$/.test(p)) {
            const num = Number(p);
            return num === 7 ? 0 : num; // Map 7 (Sunday) to 0
          }
          if (DAY_MAP[p] !== undefined) return DAY_MAP[p];
          return -1;
        })
        .filter((n) => n >= 0 && n <= 6);

      const validWeekdays = parsedWeekdays.length > 0 ? parsedWeekdays : [1, 2, 3, 4, 5];
      const weekdaysLabel = validWeekdays
        .map((d) => DAY_NAMES[d] ?? "")
        .filter(Boolean)
        .join(", ");

      // Parse and normalize start_time and end_time (e.g. 9:00 -> 09:00)
      let startTime = row.start_time || row.start || row.from || "09:00";
      if (/^\d:\d\d$/.test(startTime)) startTime = "0" + startTime;

      let endTime = row.end_time || row.end || row.to || "17:00";
      if (/^\d:\d\d$/.test(endTime)) endTime = "0" + endTime;

      const slotDuration = Number(row.slot_duration_minutes || row.slot_duration || row.slot_interval || row.duration || 20) || 20;

      return {
        doctor_name: doctorName,
        specialization,
        department,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        chamber,
        weekdays: validWeekdays,
        weekdaysLabel: weekdaysLabel || "Mon - Fri",
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: slotDuration,
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
      const buffer = await file.arrayBuffer();
      const parsed = parseRosterBuffer(buffer);
      setRows(parsed);
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
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <Users className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Bulk Doctor Roster Setup</h2>
                  <p className="text-xs text-slate-500">Auto-configure doctors, chambers, and recurring weekly shifts via Excel (.xlsx) or CSV</p>
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
                    <FileSpreadsheet className="size-4 text-teal-600" /> Need the standard template?
                  </h3>
                  <p className="text-xs text-teal-800 leading-relaxed">
                    Download the pre-formatted roster template. Contains all fields: doctor_name, specialization, phone, email, chamber, weekdays, start_time, end_time, slot_duration_minutes.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadSampleXlsx}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-800 transition-colors"
                  >
                    <Download className="size-3.5" /> Download Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-teal-800 shadow-sm ring-1 ring-inset ring-teal-200 hover:bg-teal-50 transition-colors"
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
                  Supports up to 200 doctor shifts at once • Same format as Neoclinic_Kolkata_Synthetic_Doctor_Data.xlsx
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

              {/* Preview Table */}
              {rows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Roster Preview ({rows.length} shifts to configure)
                    </span>
                    <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md">
                      Chambers will be auto-created if missing
                    </span>
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="p-2.5">Doctor</th>
                          <th className="p-2.5">Specialization</th>
                          <th className="p-2.5">Chamber</th>
                          <th className="p-2.5">Weekly Days</th>
                          <th className="p-2.5">Hours</th>
                          <th className="p-2.5">Slot</th>
                          <th className="p-2.5">Phone</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {rows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50/70">
                            <td className="p-2.5 font-bold text-slate-900">{row.doctor_name}</td>
                            <td className="p-2.5 text-slate-600">{row.specialization}</td>
                            <td className="p-2.5 font-semibold text-teal-700">{row.chamber}</td>
                            <td className="p-2.5">{row.weekdaysLabel}</td>
                            <td className="p-2.5 whitespace-nowrap font-mono text-[11px]">{row.start_time} - {row.end_time}</td>
                            <td className="p-2.5">{row.slot_duration_minutes}m</td>
                            <td className="p-2.5 text-slate-500 font-mono text-[11px]">{row.contact_phone || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rows.length === 0 || submitting}
                onClick={handleImportSubmit}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
