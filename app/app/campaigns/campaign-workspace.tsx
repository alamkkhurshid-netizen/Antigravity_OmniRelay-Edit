"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseCampaignCsv, generateSampleCampaignCsv, ParsedContact } from "@/lib/campaign-csv";
import { CampaignList } from "./campaign-list";
import { Check, Send, AlertCircle, Users, FileSpreadsheet, Sparkles, PhoneCall, Calendar, Upload, X, Trash2, Paperclip, FileText } from "lucide-react";

type P = { id: string; full_name: string; phone: string | null; health_concern: string | null; care_communications_consent: boolean; marketing_consent: boolean };
type C = { id: string; name: string; campaign_type: string; status: string; scheduled_for: string | null; eligible_count: number; sent_count: number; delivered_count: number; read_count: number; failed_count: number; skipped_count: number };
type T = { id: string; event_type: string; provider_template_name: string; language_code: string; status: string };
type L = { id: string; name: string };
type A = { patient_id: string | null; location_id: string | null; resource_id: string | null; service_name?: string | null; starts_at: string; status: string };

const normalizeAddress = (value: string) => value.replace(/\D/g, "");
const doctorLabel = (name: string) => /^dr\b/i.test(name.trim()) ? name.trim() : `Dr ${name.trim()}`;

const HEALTHCARE_PRESETS = [
  {
    id: "health_package",
    icon: "🩺",
    title: "Health Package",
    desc: "Senior cardiac or full-body checkup",
    type: "marketing",
    name: "Preventive Health Package",
    message: "Comprehensive Health Checkup Package is now open for bookings. Inclusions: Doctor consultation, blood profile, ECG & vitals at ₹999. Book early to secure your slot.",
    segment: "all",
    department: "",
  },
  {
    id: "specialty_camp",
    icon: "👁️",
    title: "Specialty Screening Camp",
    desc: "Free eye, cataract, dental, or ortho camp",
    type: "marketing",
    name: "Free Eye & Vision Screening Camp",
    message: "Free Eye & Vision Screening Camp this Sunday from 10:00 AM to 2:00 PM. Consult our expert ophthalmologists for full diagnostic evaluations.",
    segment: "department",
    department: "Ophthalmology",
  },
  {
    id: "chronic_care",
    icon: "🔄",
    title: "Chronic Care 90-Day Recall",
    desc: "Diabetic sugar & BP periodic review",
    type: "care",
    name: "Diabetic & BP Periodic Review",
    message: "Regular monitoring is recommended for diabetes and blood pressure management. Contact our care desk to schedule your routine follow-up checkup.",
    segment: "dormant",
    department: "",
  },
  {
    id: "doctor_opd",
    icon: "👨‍⚕️",
    title: "Doctor OPD Addition",
    desc: "New specialist or extended chamber hours",
    type: "marketing",
    name: "New Specialist Consultation",
    message: "We are pleased to introduce Dr. Sunita Roy (Gynecology & Obstetrics) to our clinical team. Consultations available Mon & Thu 3:00 PM - 6:00 PM. Bookings open.",
    segment: "all",
    department: "",
  },
  {
    id: "vaccine_drive",
    icon: "🛡️",
    title: "Vaccine & Health Drive",
    desc: "Seasonal flu, pediatric, or dengue alert",
    type: "marketing",
    name: "Seasonal Flu Vaccine Drive",
    message: "Seasonal Influenza & Flu Vaccination Drive is now active. Protect your children and senior family members before the change of weather. Reserve your doses today.",
    segment: "all",
    department: "",
  },
  {
    id: "festive_schedule",
    icon: "✨",
    title: "Festive Greeting & Hours",
    desc: "Diwali/Puja wishes + holiday OPD schedule",
    type: "marketing",
    name: "Festive Greetings & Holiday Timings",
    message: "Wishing you and your family vibrant health and happiness on this festive occasion! Emergency OPD remains active 24/7. Regular chambers resume normal timings from 2nd Nov.",
    segment: "all",
    department: "",
  },
];

export function CampaignWorkspace({
  organizationName = "Neoclinic",
  patients,
  campaigns,
  templates,
  locations,
  resources,
  appointments,
  optOuts,
}: {
  organizationName?: string;
  patients: P[];
  campaigns: C[];
  templates: T[];
  locations: L[];
  resources: L[];
  appointments: A[];
  optOuts: { address: string; scope: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaUploadError, setMediaUploadError] = useState("");

  const [f, setF] = useState({
    name: "",
    campaignType: "marketing",
    templateId: "",
    segment: "all",
    department: "",
    keyword: "",
    locationId: "",
    resourceId: "",
    appointmentDate: "",
    action: "reschedule_required",
    scheduledFor: "",
    messageNote: "",
    mediaType: "none",
    mediaUrl: "",
    storagePath: "",
    fileName: "",
    actionLink: "",
  });

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMedia(true);
    setMediaUploadError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/campaigns/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setMediaUploadError(data.error || "File upload failed.");
      } else {
        setF((prev) => ({
          ...prev,
          mediaType: data.mediaType,
          mediaUrl: data.url,
          storagePath: data.storagePath,
          fileName: data.fileName,
        }));
      }
    } catch (err: any) {
      setMediaUploadError(err.message || "Failed to upload file.");
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Audience Source Mode: 'crm' (Option 1) vs 'csv' (Option 2)
  const [audienceMode, setAudienceMode] = useState<"crm" | "csv">("crm");

  // CSV Audience Upload State
  const [csvContacts, setCsvContacts] = useState<ParsedContact[]>([]);
  const [csvMeta, setCsvMeta] = useState<{ invalidCount: number; duplicateCount: number; totalRows: number } | null>(null);
  const [csvFileName, setCsvFileName] = useState("");

  // Test Message State
  const [testPhone, setTestPhone] = useState("+919831582626");
  const [testBusy, setTestBusy] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);

  // Extract distinct departments from appointments
  const availableDepartments = useMemo(() => {
    const set = new Set<string>();
    appointments.forEach((a) => {
      if (a.service_name && a.service_name.trim().length > 1) {
        set.add(a.service_name.trim());
      }
    });
    ["Gynecology", "Ophthalmology", "Pediatrics", "Cardiology", "Orthopedics", "General Medicine"].forEach((d) => set.add(d));
    return Array.from(set).sort();
  }, [appointments]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      const type = searchParams.get("type") || "emergency";
      const resourceId = searchParams.get("resourceId") || "";
      const locationId = searchParams.get("locationId") || "";
      const appointmentDate = searchParams.get("date") || "";
      const reason = searchParams.get("reason") || "";

      const docName = resources.find((r) => r.id === resourceId)?.name;
      const defaultName = reason
        ? `Notice: ${reason.slice(0, 30)}`
        : docName
        ? `Disruption · ${doctorLabel(docName)}`
        : "Emergency Chamber Notice";

      const targetEvent = { care: "care_campaign", marketing: "marketing_campaign", emergency: "emergency_notice" }[type];
      const matchingTpl = templates.find((t) => t.event_type === targetEvent && t.status === "approved");

      setF((prev) => ({
        ...prev,
        name: prev.name || defaultName,
        campaignType: type,
        templateId: prev.templateId || matchingTpl?.id || "",
        resourceId: resourceId || prev.resourceId,
        locationId: locationId || prev.locationId,
        appointmentDate: appointmentDate || prev.appointmentDate,
        messageNote: reason || prev.messageNote,
        action: "notify_only",
      }));
      setOpen(true);
    }
  }, [searchParams, resources, templates]);

  const event = { care: "care_campaign", marketing: "marketing_campaign", emergency: "emergency_notice" }[f.campaignType];
  const approved = templates.filter((t) => t.status === "approved" && t.event_type === event);
  const selectedDoctor = resources.find((resource) => resource.id === f.resourceId)?.name;
  const emergencyPreview = selectedDoctor
    ? `${doctorLabel(selectedDoctor)} is unavailable. ${f.messageNote.trim() || "Please contact the clinic for assistance."}`
    : "Select a doctor to preview the patient message.";

  // Sync template selection when approved templates load or type changes
  useEffect(() => {
    if (!f.templateId && approved.length > 0) {
      setF((prev) => ({ ...prev, templateId: approved[0].id }));
    }
  }, [approved, f.templateId]);

  function applyPreset(p: typeof HEALTHCARE_PRESETS[0]) {
    const targetEvent = { care: "care_campaign", marketing: "marketing_campaign", emergency: "emergency_notice" }[p.type];
    const match = templates.find((t) => t.event_type === targetEvent && t.status === "approved");

    setAudienceMode("crm");
    setF((prev) => ({
      ...prev,
      name: p.name,
      campaignType: p.type,
      templateId: match?.id || prev.templateId,
      segment: p.segment,
      department: p.department || "",
      messageNote: p.message,
    }));
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = String(evt.target?.result || "");
      const res = parseCampaignCsv(text);
      setCsvContacts(res.validContacts);
      setCsvMeta({ invalidCount: res.invalidCount, duplicateCount: res.duplicateCount, totalRows: res.totalRows });
    };
    reader.readAsText(file);
  }

  function downloadSampleCsv() {
    const content = generateSampleCampaignCsv();
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample-patient-broadcast.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  // Calculate eligible count based on segment choice
  const eligibleCount = useMemo(() => {
    const scope = f.campaignType === "marketing" ? "marketing" : "care";
    const optedOutSet = new Set(
      optOuts.filter((o) => o.scope === "all" || o.scope === scope).map((o) => normalizeAddress(o.address))
    );

    if (audienceMode === "csv") {
      return csvContacts.filter((c) => !optedOutSet.has(normalizeAddress(c.phone))).length;
    }

    // 90 days ago cutoff for dormant filter
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const recentPatientIds = new Set(
      appointments.filter((a) => a.starts_at >= ninetyDaysAgo).map((a) => a.patient_id).filter(Boolean)
    );
    const deptMatchIds =
      f.segment === "department" && f.department
        ? new Set(
            appointments
              .filter((a) => String(a.service_name || "").toLowerCase().includes(f.department.toLowerCase()))
              .map((a) => a.patient_id)
              .filter(Boolean)
          )
        : null;

    const filtered = patients.filter((p) => {
      if (!p.phone) return false;
      if (scope === "marketing" ? !p.marketing_consent : !p.care_communications_consent) return false;
      if (optedOutSet.has(normalizeAddress(p.phone))) return false;
      if (f.segment === "health" && !String(p.health_concern ?? "").toLowerCase().includes(f.keyword.toLowerCase())) return false;
      if (f.segment === "department" && deptMatchIds && !deptMatchIds.has(p.id) && !String(p.health_concern ?? "").toLowerCase().includes(f.department.toLowerCase())) return false;
      if (f.segment === "dormant" && recentPatientIds.has(p.id)) return false;
      if (f.campaignType === "emergency") {
        return appointments.some(
          (a) =>
            a.patient_id === p.id &&
            a.location_id === f.locationId &&
            a.resource_id === f.resourceId &&
            a.starts_at.slice(0, 10) === f.appointmentDate &&
            ["pending", "payment_pending", "confirmed", "arrived", "rescheduling_required"].includes(a.status)
        );
      }
      return true;
    });

    return filtered.length;
  }, [patients, appointments, optOuts, f, audienceMode, csvContacts]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    if (audienceMode === "csv" && csvContacts.length === 0) {
      setError("Please upload a valid CSV file containing patient contact numbers.");
      setBusy(false);
      return;
    }

    const payload = {
      ...f,
      segment: audienceMode === "csv" ? "csv" : f.segment,
      csvContacts: audienceMode === "csv" ? csvContacts : undefined,
    };

    const r = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error ?? "Could not create campaign.");
    } else {
      setOpen(false);
      setCsvContacts([]);
      setCsvMeta(null);
      setCsvFileName("");
      router.refresh();
    }
    setBusy(false);
  }

  async function action(id: string, actionName: string, extra?: { testPhone?: string }) {
    setBusy(true);
    setError("");
    const r = await fetch("/api/campaigns", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action: actionName, ...extra }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error ?? "Campaign could not be updated.");
    } else if (actionName === "send_test") {
      alert(`Test message dispatched to ${extra?.testPhone || "phone"}! Check your WhatsApp.`);
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-5 pb-12">
      <section className="relative flex flex-col gap-6 overflow-hidden rounded-2xl bg-slate-950 px-6 py-8 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:px-8 isolate mb-6">
        <div className="absolute -top-32 -right-32 h-[30rem] w-[30rem] rounded-full bg-teal-500/20 blur-[120px] -z-10 pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 h-[30rem] w-[30rem] rounded-full bg-blue-600/20 blur-[120px] -z-10 pointer-events-none" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none -z-10" />
        
        <div className="z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-teal-400 ring-1 ring-inset ring-teal-500/20 uppercase">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-500"></span>
            </span>
            HEALTHCARE BROADCAST & OUTREACH
          </span>
          <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-100 to-slate-400 leading-[1.15]">
            Reach patients with verified health campaigns.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-400 font-medium tracking-wide">
            Broadcast health packages, eye checkup camps, specialty recalls, and chamber disruptions to both registered CRM patients and external CSV lists.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 z-10">
          <button
            type="button"
            onClick={downloadSampleCsv}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/80 px-4 text-[13px] font-semibold text-slate-200 transition-all hover:bg-slate-800 hover:text-white"
          >
            📥 Download Sample CSV
          </button>
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-teal-400 to-blue-500 px-5 text-[13px] font-bold text-slate-950 shadow-[0_0_20px_rgba(45,212,191,0.25)] transition-all hover:from-teal-300 hover:to-blue-400 hover:scale-[1.02]"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
          >
            + Create New Campaign →
          </button>
        </div>
      </section>

      <section className="campaign-metrics">
        <article>
          <span>Registered CRM Patients</span>
          <b>{patients.length}</b>
          <small>Accumulated via Web, Bot & Voice</small>
        </article>
        <article>
          <span>Consented Audience</span>
          <b>{patients.filter((p) => p.marketing_consent || p.care_communications_consent).length}</b>
          <small>Active WhatsApp recipients</small>
        </article>
        <article>
          <span>Delivered</span>
          <b>{campaigns.reduce((n, c) => n + c.delivered_count, 0)}</b>
          <small>{campaigns.reduce((n, c) => n + c.read_count, 0)} confirmed read</small>
        </article>
        <article>
          <span>Opt-Out Protection</span>
          <b>{optOuts.length}</b>
          <small>Auto-skipped on STOP</small>
        </article>
      </section>

      <CampaignList
        campaigns={campaigns}
        busy={busy}
        error={error}
        onAction={action}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700 font-bold text-xs">
              ℹ
            </span>
            <h4 className="text-sm font-bold text-slate-900">
              Meta WhatsApp Broadcast Guidelines & Safe Sending Limits
            </h4>
          </div>
          <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200/60">
            Official Cloud API Tier Rules
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-1.5">
            <b className="text-xs text-slate-900 flex items-center gap-1.5">
              <span>📈</span> Daily Contact Tiers
            </b>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              • <strong>Tier 1:</strong> 250 unique patients / 24h (new unverified)<br />
              • <strong>Tier 2:</strong> 1,000 unique patients / 24h (verified)<br />
              • <strong>Tier 3:</strong> 10,000 / day &rarr; Auto-upgrades as quality stays green.
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-1.5">
            <b className="text-xs text-slate-900 flex items-center gap-1.5">
              <span>🛡️</span> Quality Rating & Safety
            </b>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Meta monitors user blocks. OmniRelay auto-applies a <strong>72-hour frequency cap</strong> and mandatory <strong>STOP opt-out</strong> to keep your number rating <em>High (Green)</em>.
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-1.5">
            <b className="text-xs text-slate-900 flex items-center gap-1.5">
              <span>📎</span> Media & Link Support
            </b>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Campaigns support <strong>PDF brochures</strong> (up to 100MB), <strong>JPEG/PNG posters</strong> (up to 5MB), and <strong>clickable booking links</strong> directly inside the template.
            </p>
          </div>
        </div>
      </section>

      {/* Campaign Creation Modal */}
      {open && (
        <div className="care-modal-backdrop">
          <form className="care-modal max-w-4xl max-h-[92vh] overflow-y-auto" onSubmit={submit}>
            <header>
              <div>
                <span className="app-eyebrow">HEALTHCARE BROADCAST WIZARD</span>
                <h3>Create Patient Campaign</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>

            {/* Presets Header */}
            <div className="wide space-y-2 border-b border-slate-100 pb-3">
              <label className="text-xs font-semibold text-slate-700 block">
                ⚡ Quick Healthcare Presets (Click to Auto-fill):
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {HEALTHCARE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="flex flex-col items-start p-2.5 rounded-xl border border-slate-200 bg-white hover:border-teal-500 hover:bg-teal-50/40 text-left transition-all"
                  >
                    <span className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <span>{p.icon}</span> {p.title}
                    </span>
                    <span className="text-[11px] text-slate-500 line-clamp-1">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Campaign Name & Type */}
            <label>
              Campaign Name
              <input
                required
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
                placeholder="e.g. Senior Cardiac Health Package or Free Eye Screening Camp"
              />
            </label>

            <label>
              Campaign Category
              <select
                value={f.campaignType}
                onChange={(e) => setF({ ...f, campaignType: e.target.value, templateId: "" })}
              >
                <option value="marketing">Marketing (Health Packages, Eye Camps, Offers, Announcements)</option>
                <option value="care">Clinical Care Update (Chronic Disease Recall, Seasonal Health)</option>
                <option value="emergency">Emergency Disruption (Doctor unavailable, Chamber maintenance)</option>
              </select>
            </label>

            {/* AUDIENCE SOURCE SELECTION (The 2 Options) */}
            {f.campaignType !== "emergency" && (
              <div className="wide space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  Select Audience Source:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAudienceMode("crm")}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      audienceMode === "crm"
                        ? "border-teal-600 bg-white shadow-sm ring-2 ring-teal-500/20"
                        : "border-slate-200 bg-white/70 hover:bg-white"
                    }`}
                  >
                    <Users className={`h-5 w-5 mt-0.5 ${audienceMode === "crm" ? "text-teal-600" : "text-slate-400"}`} />
                    <div>
                      <b className="text-xs text-slate-900 block">Option 1: Registered CRM Patients</b>
                      <span className="text-[11px] text-slate-500">
                        Patients accumulated automatically through Web, WhatsApp Bot, and Voice AI bookings.
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudienceMode("csv")}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      audienceMode === "csv"
                        ? "border-teal-600 bg-white shadow-sm ring-2 ring-teal-500/20"
                        : "border-slate-200 bg-white/70 hover:bg-white"
                    }`}
                  >
                    <FileSpreadsheet className={`h-5 w-5 mt-0.5 ${audienceMode === "csv" ? "text-teal-600" : "text-slate-400"}`} />
                    <div>
                      <b className="text-xs text-slate-900 block">Option 2: Upload CSV / Excel List</b>
                      <span className="text-[11px] text-slate-500">
                        Import audience from CSV file. Add historical patients or external camp attendees.
                      </span>
                    </div>
                  </button>
                </div>

                {/* Sub-Filters for Option 1: CRM */}
                {audienceMode === "crm" && (
                  <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-xs">
                      CRM Segment Filter
                      <select
                        value={f.segment}
                        onChange={(e) => setF({ ...f, segment: e.target.value })}
                        className="mt-1"
                      >
                        <option value="all">All Consented Patients ({patients.length})</option>
                        <option value="department">Filter by Specialty / Department Visited</option>
                        <option value="dormant">Dormant Patients (&gt; 90 days without visit)</option>
                        <option value="health">Filter by Health Concern Tag</option>
                      </select>
                    </label>

                    {f.segment === "department" && (
                      <label className="text-xs">
                        Department / Specialty
                        <select
                          value={f.department}
                          onChange={(e) => setF({ ...f, department: e.target.value })}
                          className="mt-1"
                        >
                          <option value="">Select Specialty</option>
                          {availableDepartments.map((dept) => (
                            <option key={dept} value={dept}>
                              {dept}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {f.segment === "health" && (
                      <label className="text-xs">
                        Health Concern Keyword
                        <input
                          required
                          value={f.keyword}
                          onChange={(e) => setF({ ...f, keyword: e.target.value })}
                          placeholder="e.g. Diabetes, Cardiac, Eye"
                          className="mt-1"
                        />
                      </label>
                    )}
                  </div>
                )}

                {/* Sub-Uploader for Option 2: CSV */}
                {audienceMode === "csv" && (
                  <div className="p-3 rounded-xl border border-dashed border-[#159ab6] bg-[#f7fcfd] space-y-2">
                    <div className="flex items-center justify-between">
                      <b className="text-xs text-[#1e3a4b]">Upload Patient Contacts CSV</b>
                      <button type="button" className="text-xs text-[#087fa3] font-bold underline" onClick={downloadSampleCsv}>
                        📥 Download Sample CSV
                      </button>
                    </div>
                    <input type="file" accept=".csv" onChange={handleCsvFile} className="w-full text-xs" />
                    {csvFileName && (
                      <p className="text-xs text-[#059669] font-medium">
                        ✓ {csvFileName} loaded: {csvContacts.length} valid numbers
                        {csvMeta ? ` (${csvMeta.duplicateCount} duplicates, ${csvMeta.invalidCount} invalid rows skipped)` : ""}
                      </p>
                    )}
                    <small className="block text-[11px] text-[#64748b]">
                      Required CSV format: <code>Name, Phone, Notes</code>. Indian (+91) and international formats supported.
                    </small>
                  </div>
                )}
              </div>
            )}

            {/* Emergency Chamber Specific Controls */}
            {f.campaignType === "emergency" && (
              <>
                <p className="wide rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  Doctor-specific emergency only. OmniRelay will only notify scheduled patients for that specific doctor and chamber.
                </p>
                <label>
                  Doctor
                  <select required value={f.resourceId} onChange={(e) => setF({ ...f, resourceId: e.target.value })}>
                    <option value="">Select doctor</option>
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Chamber / Location
                  <select required value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>
                    <option value="">Select chamber</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Affected Date
                  <input required type="date" value={f.appointmentDate} onChange={(e) => setF({ ...f, appointmentDate: e.target.value })} />
                </label>
                <label>
                  Appointment Action
                  <select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}>
                    <option value="reschedule_required">Mark future appointments for rescheduling</option>
                    <option value="notify_only">Notify only — staff will decide each appointment</option>
                  </select>
                </label>
              </>
            )}

            {/* Approved Meta Template */}
            <label>
              Approved Meta Template
              <select required value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}>
                <option value="">Select approved template</option>
                {approved.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.provider_template_name} · {t.language_code.toUpperCase()}
                  </option>
                ))}
              </select>
              {approved.length === 0 && (
                <small className="text-amber-600 block mt-1">
                  ⚠️ No approved template found for this category yet. Create or activate it in Meta Integrations.
                </small>
              )}
            </label>

            <label>
              Schedule Dispatch
              <input
                type="datetime-local"
                value={f.scheduledFor}
                onChange={(e) => setF({ ...f, scheduledFor: e.target.value })}
              />
            </label>

            {/* Campaign Message / Details */}
            <label className="wide">
              Campaign Message / Package Details
              <textarea
                required
                minLength={3}
                maxLength={1000}
                rows={3}
                value={f.messageNote}
                onChange={(e) => setF({ ...f, messageNote: e.target.value })}
                placeholder="e.g. Free Eye Checkup Camp this Sunday from 10 AM to 2 PM. Consult our expert ophthalmologists."
              />
              <small className="text-slate-500">
                This content binds directly to Meta template variable <code>&#123;&#123;3&#125;&#125;</code> and will be delivered to recipients.
              </small>
            </label>

            {/* MEDIA ATTACHMENTS & CLICKABLE ACTION LINKS */}
            <div className="wide rounded-xl border border-teal-200/80 bg-teal-50/30 p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <b className="text-xs text-slate-900 flex items-center gap-1.5">
                  <Paperclip className="h-4 w-4 text-teal-600" /> Attach Media or Action Link (Optional)
                </b>
                <span className="text-[10px] text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded font-semibold border border-teal-300">
                  Auto-purged post-dispatch
                </span>
              </div>

              {/* Direct File Upload Zone */}
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={handleMediaUpload}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Direct upload trigger button */}
                  <div
                    className="flex flex-col justify-center items-center p-3 rounded-xl border-2 border-dashed border-teal-300 bg-white hover:bg-teal-50/50 transition-colors text-center cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-5 w-5 text-teal-600 mb-1" />
                    <button
                      type="button"
                      disabled={uploadingMedia}
                      className="text-xs font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-50"
                    >
                      {uploadingMedia ? "Uploading to secure cloud..." : "📂 Upload Image or PDF from Computer"}
                    </button>
                    <span className="text-[10px] text-slate-500 mt-0.5">
                      JPEG, PNG or PDF (up to 10 MB)
                    </span>
                  </div>

                  {/* Manual Type / Link Fallback */}
                  <div className="space-y-2">
                    <label className="text-xs">
                      Attachment Type
                      <select
                        value={f.mediaType}
                        onChange={(e) => {
                          const val = e.target.value;
                          setF((prev) => ({
                            ...prev,
                            mediaType: val,
                            ...(val === "none" ? { mediaUrl: "", storagePath: "", fileName: "" } : {}),
                          }));
                        }}
                        className="mt-1"
                      >
                        <option value="none">None (Standard Text Broadcast)</option>
                        <option value="image">🖼️ Image Poster / Flyer (JPEG, PNG)</option>
                        <option value="document">📑 PDF Document / Test Package Tariff (PDF)</option>
                      </select>
                    </label>

                    {f.mediaType !== "none" && !f.storagePath && (
                      <label className="text-xs">
                        {f.mediaType === "document" ? "Or Paste PDF Document Link (URL)" : "Or Paste Image Flyer Link (URL)"}
                        <input
                          type="url"
                          value={f.mediaUrl}
                          onChange={(e) => setF({ ...f, mediaUrl: e.target.value })}
                          placeholder={f.mediaType === "document" ? "https://example.com/health_package.pdf" : "https://example.com/eye_camp_poster.jpg"}
                          className="mt-1"
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* File Upload Progress or Status */}
                {f.mediaUrl && (
                  <div className="flex items-center justify-between rounded-lg bg-teal-100/70 border border-teal-300 px-3 py-2 text-xs text-teal-950">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-base">{f.mediaType === "document" ? "📑" : "🖼️"}</span>
                      <div className="truncate">
                        <span className="font-semibold block truncate">{f.fileName || (f.mediaType === "document" ? "Attached PDF Document" : "Attached Image Flyer")}</span>
                        <span className="text-[10px] text-teal-800">
                          {f.storagePath ? "✓ Stored securely · Will be automatically deleted after campaign finishes" : "External URL attached"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setF((prev) => ({ ...prev, mediaType: "none", mediaUrl: "", storagePath: "", fileName: "" }))}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 shrink-0 ml-3"
                    >
                      Remove
                    </button>
                  </div>
                )}

                {mediaUploadError && (
                  <p className="text-xs text-rose-600">{mediaUploadError}</p>
                )}
              </div>

              <label className="text-xs block">
                Website / Online Booking Link (Rendered as Clickable Link in WhatsApp)
                <input
                  type="url"
                  value={f.actionLink}
                  onChange={(e) => setF({ ...f, actionLink: e.target.value })}
                  placeholder="e.g. https://neoclinic.in/camp or https://omnirelay.in/book/neoclinic"
                  className="mt-1"
                />
              </label>
            </div>

            {/* REAL-TIME WHATSAPP PREVIEW BUBBLE */}
            <div className="wide rounded-xl border border-slate-200 bg-slate-100/70 p-4 space-y-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                📱 Live Patient WhatsApp Preview
              </span>
              <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-slate-200/80 p-3.5 space-y-2.5 text-xs text-slate-800">
                <div className="font-semibold text-slate-900 flex items-center justify-between border-b pb-1.5">
                  <span>{organizationName}</span>
                  <span className="text-[10px] text-slate-400">Official Business</span>
                </div>

                {/* Attached Image Poster Preview */}
                {f.mediaType === "image" && f.mediaUrl && (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-32 flex items-center justify-center text-slate-400">
                    <img
                      src={f.mediaUrl}
                      alt="Campaign Flyer"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = "none";
                      }}
                    />
                    <span className="absolute bottom-1 right-2 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
                      🖼️ Image Poster Attached
                    </span>
                  </div>
                )}

                {/* Attached PDF Document Card Preview */}
                {f.mediaType === "document" && (
                  <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                    <span className="text-xl">📑</span>
                    <div className="truncate flex-1">
                      <b className="text-[11px] text-slate-900 block truncate">
                        {f.fileName || (f.mediaUrl ? f.mediaUrl.split("/").pop() : "Health_Checkup_Brochure.pdf")}
                      </b>
                      <span className="text-[10px] text-slate-400">PDF Document</span>
                    </div>
                  </div>
                )}

                <p className="leading-relaxed">
                  Hello <strong>Rahul Sharma</strong>,
                </p>
                <p className="leading-relaxed text-slate-700">
                  {f.campaignType === "emergency" ? emergencyPreview : f.messageNote || "Your campaign announcement or health camp details will appear here."}
                </p>

                {/* Attached Clickable Action Link */}
                {f.actionLink && (
                  <div className="p-2 rounded-lg bg-teal-50/60 border border-teal-100 text-[11px] text-teal-800 truncate">
                    🔗 <strong>Link:</strong> <span className="underline">{f.actionLink}</span>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-1 text-[10px] text-slate-400">
                  Reply STOP anytime to unsubscribe.
                </div>
                <div className="pt-1.5 grid grid-cols-2 gap-2">
                  <div className="text-center py-1.5 bg-slate-50 rounded-lg text-teal-700 font-semibold border border-teal-100 text-[11px] flex items-center justify-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Book Slot
                  </div>
                  <div className="text-center py-1.5 bg-slate-50 rounded-lg text-slate-600 font-semibold border border-slate-200 text-[11px] flex items-center justify-center gap-1">
                    <PhoneCall className="w-3.5 h-3.5" /> Call Reception
                  </div>
                </div>
              </div>
            </div>

            {/* Audience Summary Box */}
            <div className="campaign-preview wide">
              <b>{eligibleCount} eligible patient recipients</b>
              <span>
                {audienceMode === "csv"
                  ? "Screened for E.164 formatting, duplicate mobile numbers, and active communication opt-outs"
                  : `${patients.length - eligibleCount} excluded by consent status, duplicate mobile, or opt-out registry`}
              </span>
            </div>

            {error && <p className="care-error wide">{error}</p>}

            <button
              type="submit"
              className="care-submit wide"
              disabled={busy || !approved.length || eligibleCount === 0}
            >
              {busy ? "Scheduling Campaign…" : `Schedule Campaign (${eligibleCount} Patients)`}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
