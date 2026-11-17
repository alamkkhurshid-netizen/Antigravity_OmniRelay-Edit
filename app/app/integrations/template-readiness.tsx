"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Sparkles, AlertCircle, ArrowUpRight, MessageSquare, Bot, BellRing, ChevronDown, ChevronUp } from "lucide-react";

type Template = {
  id: string;
  event_type: string;
  provider_template_name: string;
  language_code: string;
  status: string;
  variable_map: Record<string, string> | null;
};
type Reminder = { event_type: string; status: string };
type DoctorDispatch = { status: string };

type LifecycleGroupSpec = {
  key: string;
  title: string;
  description: string;
  events: string[];
  defaultTemplateName: string;
  category: "UTILITY" | "MARKETING";
  bodyText: string;
  variables: Record<string, string>;
  sampleValues: Record<string, string>;
};

const lifecycleSpecs: LifecycleGroupSpec[] = [
  {
    key: "confirmation",
    title: "Booking confirmation",
    description: "Sent immediately after a patient books an appointment via web, staff, or WhatsApp.",
    events: ["confirmation"],
    defaultTemplateName: "omnirelay_booking_confirmation",
    category: "UTILITY",
    bodyText: "Hello {{1}}, your appointment with {{2}} is confirmed for {{3}} at {{4}}. Manage or reschedule your appointment here: {{5}}",
    variables: { "1": "patient_name", "2": "clinic_name", "3": "appointment_time", "4": "chamber_location", "5": "manage_url" },
    sampleValues: { "1": "Rahul Sharma", "2": "Dr Alam's Clinic", "3": "Tuesday 18 Nov at 4:00 PM", "4": "Chamber 1", "5": "https://omnirelay.in/m/abc123" }
  },
  {
    key: "appointment-reminder",
    title: "Appointment reminders",
    description: "Sent automatically 24 hours and 2 hours before the patient's scheduled consultation time.",
    events: ["reminder_24h", "reminder_2h"],
    defaultTemplateName: "omnirelay_appointment_reminder",
    category: "UTILITY",
    bodyText: "Reminder: Hello {{1}}, your appointment with {{2}} is scheduled for {{3}} at {{4}}. If you need to make changes, visit: {{5}}",
    variables: { "1": "patient_name", "2": "clinic_name", "3": "appointment_time", "4": "chamber_location", "5": "manage_url" },
    sampleValues: { "1": "Rahul Sharma", "2": "Dr Alam's Clinic", "3": "Tomorrow at 4:00 PM", "4": "Chamber 1", "5": "https://omnirelay.in/m/abc123" }
  },
  {
    key: "booking-change",
    title: "Cancellation and reschedule",
    description: "Keeps affected patients informed in real time when a doctor cancels or shifts chamber timings.",
    events: ["cancellation", "reschedule"],
    defaultTemplateName: "omnirelay_booking_change",
    category: "UTILITY",
    bodyText: "Hello {{1}}, regarding your appointment with {{2}} on {{3}}: {{4}}. To book a new time or view details: {{5}}",
    variables: { "1": "patient_name", "2": "clinic_name", "3": "appointment_time", "4": "action_summary", "5": "manage_url" },
    sampleValues: { "1": "Rahul Sharma", "2": "Dr Alam's Clinic", "3": "Tuesday 18 Nov at 4:00 PM", "4": "Your appointment has been rescheduled", "5": "https://omnirelay.in/m/abc123" }
  },
  {
    key: "follow-up",
    title: "Follow-up and revisit",
    description: "Dispatched on the doctor-recommended follow-up date with a 1-click booking link.",
    events: ["follow_up"],
    defaultTemplateName: "omnirelay_follow_up",
    category: "UTILITY",
    bodyText: "Hello {{1}}, this is a follow-up check from {{2}} regarding your care with Dr. {{3}}. To schedule your follow-up consultation, please visit: {{4}}",
    variables: { "1": "patient_name", "2": "clinic_name", "3": "doctor_name", "4": "booking_url" },
    sampleValues: { "1": "Rahul Sharma", "2": "Dr Alam's Clinic", "3": "Dr Alok Ray", "4": "https://omnirelay.in/book" }
  },
  {
    key: "doctor-queue",
    title: "Doctor queue update",
    description: "Sent to visiting consultants before their shift with patient count and chamber details.",
    events: ["doctor_queue"],
    defaultTemplateName: "omnirelay_doctor_queue",
    category: "UTILITY",
    bodyText: "Good day Dr. {{1}}, your upcoming shift at {{2}} ({{3}}) currently has {{4}} scheduled patient bookings.",
    variables: { "1": "doctor_name", "2": "clinic_name", "3": "shift_and_chamber", "4": "booking_count" },
    sampleValues: { "1": "Dr Alok Ray", "2": "Dr Alam's Clinic", "3": "Tuesday 15:00-19:00 (Chamber 5)", "4": "8" }
  },
];

export function TemplateReadiness({
  templates,
  reminders,
  doctorDispatches,
  organizationId,
  bookingEnabled = true,
}: {
  templates: Template[];
  reminders: Reminder[];
  doctorDispatches: DoctorDispatch[];
  organizationId?: string;
  bookingEnabled?: boolean;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [expandedSpec, setExpandedSpec] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const groups = useMemo(() => {
    return lifecycleSpecs.map((spec) => {
      const rows = templates.filter((template) => spec.events.includes(template.event_type));
      const doctorGroup = spec.key === "doctor-queue";
      const deliveryRows = doctorGroup
        ? doctorDispatches
        : reminders.filter((row) => spec.events.includes(row.event_type));

      const isApproved =
        rows.length > 0 &&
        rows.length === spec.events.length &&
        rows.every((row) => row.status === "approved");

      const isLiveVerified = deliveryRows.some(
        (row) => row.status === "sent" || row.status === "delivered" || row.status === "read"
      );

      const templateName = rows[0]?.provider_template_name || spec.defaultTemplateName;
      const variableEntries = Object.entries(
        rows[0]?.variable_map || spec.variables
      ).sort(([a], [b]) => Number(a) - Number(b));

      return {
        ...spec,
        rows,
        templateName,
        approved: isApproved,
        liveVerified: isLiveVerified,
        queued: deliveryRows.filter((row) => row.status === "scheduled" || row.status === "queued").length,
        failed: deliveryRows.filter((row) => row.status === "failed").length,
        variableEntries,
      };
    });
  }, [templates, reminders, doctorDispatches]);

  const allApproved = groups.every((g) => g.approved);

  async function activateGroup(key: string) {
    setBusy(key);
    setNotice(null);
    try {
      const res = await fetch("/api/integrations/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate_group", group_key: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to activate template in OmniRelay");
      setNotice({ type: "success", text: `Template "${key}" activated in OmniRelay.` });
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error activating template";
      setNotice({ type: "error", text: msg });
    } finally {
      setBusy("");
    }
  }

  async function activateAll() {
    setBusy("all");
    setNotice(null);
    try {
      const res = await fetch("/api/integrations/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate_all" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to activate templates");
      setNotice({
        type: "success",
        text: "All 5 standard templates activated in OmniRelay & WhatsApp Booking Concierge verified active!",
      });
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error activating templates";
      setNotice({ type: "error", text: msg });
    } finally {
      setBusy("");
    }
  }

  function copyText(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
      {/* 1. ARCHITECTURE EDUCATION BANNER: Inbound Booking vs Outbound Templates */}
      <div className="border-b border-slate-200/80 bg-gradient-to-r from-sky-50 via-teal-50/40 to-slate-50 p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-teal-200/80 bg-teal-50/50 p-3.5 shadow-2xs">
            <div className="flex items-center gap-2 text-teal-900 font-bold text-xs uppercase tracking-wider">
              <Bot className="size-4 text-teal-700" />
              <span>1. Inbound Patient Booking (Live Immediately)</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-700 leading-relaxed font-medium">
              When any patient sends <b className="text-slate-900 font-bold">&quot;Hi&quot;</b> or messages your clinic WhatsApp number, Meta opens a free <strong className="text-teal-800">24-hour service window</strong>. OmniRelay&apos;s interactive booking bot responds immediately with doctors, chambers, and slots. <strong className="text-teal-900 underline">NO Meta templates are needed for incoming patient chats!</strong>
            </p>
            <div className="mt-2.5 flex items-center gap-2 text-[11px] font-semibold text-teal-800">
              <span className={`size-2 rounded-full ${bookingEnabled ? "bg-teal-500 animate-pulse" : "bg-amber-400"}`} />
              <span>{bookingEnabled ? "WhatsApp Concierge Bot is Active" : "Concierge paused - turn on below"}</span>
            </div>
          </div>

          <div className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-3.5 shadow-2xs">
            <div className="flex items-center gap-2 text-sky-900 font-bold text-xs uppercase tracking-wider">
              <BellRing className="size-4 text-sky-700" />
              <span>2. Outbound Scheduled Alerts (Requires 5 Templates)</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-700 leading-relaxed font-medium">
              When OmniRelay sends scheduled alerts <strong className="text-slate-900">outside the 24h window</strong> (e.g. 24h & 2h before the visit, doctor shift queue), Meta requires pre-approved templates. Once created in WhatsApp Manager, confirm each card below to enable automated dispatch.
            </p>
            <div className="mt-2.5 flex items-center gap-2 text-[11px] font-semibold text-sky-800">
              <span className="size-2 rounded-full bg-sky-500" />
              <span>5 Standard OmniRelay Templates Configured</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SECTION HEADER WITH ACTIONS */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 bg-slate-50/70 px-5 py-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-teal-800">PRODUCTION TEMPLATE HEALTH</span>
          <h3 className="mt-0.5 text-base font-bold text-slate-900 leading-snug">Meta Utility Templates & Dispatch Status</h3>
          <p className="mt-1 max-w-2xl text-xs font-medium text-slate-600 leading-relaxed">
            Click <strong className="text-slate-800">&quot;Open WhatsApp Manager ↗&quot;</strong> to review or create templates on Meta, or use <strong className="text-slate-800">&quot;1-Click Activate&quot;</strong> once created in Meta to enable OmniRelay delivery.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!allApproved && (
            <button
              onClick={activateAll}
              disabled={busy === "all"}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3.5 text-xs font-bold text-white hover:bg-teal-800 shadow-2xs transition disabled:opacity-50"
            >
              <Sparkles size={13} />
              {busy === "all" ? "Activating all…" : "⚡ 1-Click Activate All in OmniRelay"}
            </button>
          )}
          <a
            href="https://business.facebook.com/wa/manage/message-templates/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition"
          >
            <span>Open WhatsApp Manager</span>
            <ArrowUpRight size={13} />
          </a>
        </div>
      </header>

      {/* 3. NOTICE BANNER */}
      {notice && (
        <div
          className={`mx-4 mt-4 flex items-center gap-2 rounded-lg p-3 text-xs font-medium ${
            notice.type === "success"
              ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
              : "bg-rose-50 text-rose-900 border border-rose-200"
          }`}
        >
          {notice.type === "success" ? <Check size={14} className="text-emerald-700 shrink-0" /> : <AlertCircle size={14} className="text-rose-700 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* 4. TEMPLATE CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 p-4">
        {groups.map((group) => {
          const isExpanded = expandedSpec === group.key;
          return (
            <article
              key={group.key}
              className={`flex flex-col justify-between rounded-xl border p-3.5 shadow-2xs transition hover:border-slate-300 ${
                group.liveVerified
                  ? "border-emerald-200/90 bg-emerald-50/20"
                  : group.approved
                  ? "border-sky-200/90 bg-sky-50/20"
                  : "border-slate-200/80 bg-white"
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold ${
                        group.liveVerified
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300/50"
                          : group.approved
                          ? "bg-sky-100 text-sky-800 border border-sky-300/50"
                          : "bg-amber-100 text-amber-800 border border-amber-300/50"
                      }`}
                    >
                      {group.liveVerified ? "✓" : group.approved ? "•" : "!"}
                    </span>
                    <b className="text-xs font-bold text-slate-900 leading-snug">{group.title}</b>
                  </div>

                  <strong
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold shrink-0 ${
                      group.liveVerified
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : group.approved
                        ? "bg-sky-50 text-sky-800 border border-sky-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {group.liveVerified
                      ? "Live delivery verified"
                      : group.approved
                      ? "Active in OmniRelay"
                      : "Blocked by approval"}
                  </strong>
                </div>

                <p className="mt-2 text-[11px] font-medium text-slate-600 leading-snug">
                  {group.description}
                </p>

                {/* Template Name */}
                <div className="mt-2.5 flex items-center justify-between gap-2 rounded-md bg-slate-100/80 px-2 py-1 text-[11px] font-mono text-slate-800 border border-slate-200/60">
                  <span className="text-[10px] text-slate-500 font-sans uppercase font-bold tracking-wider">Template</span>
                  <span className="truncate font-semibold text-teal-800">{group.templateName}</span>
                </div>

                {/* Variables */}
                {group.variableEntries.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {group.variableEntries.map(([position, name]) => (
                      <span
                        key={position}
                        className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200/80 shadow-2xs capitalize"
                      >
                        <code className="text-[9px] font-bold text-teal-700">{`{{${position}}}`}</code>
                        {name.replaceAll("_", " ")}
                      </span>
                    ))}
                  </div>
                )}

                {/* Spec drawer toggle */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setExpandedSpec(isExpanded ? null : group.key)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900"
                  >
                    <span>{isExpanded ? "Hide Meta Spec & Body" : "View Meta Spec & Body"}</span>
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px]">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 text-slate-500 font-mono text-[10px]">
                        <span>CATEGORY: <b className="text-slate-800 font-bold">{group.category}</b></span>
                        <span>LANG: <b className="text-slate-800 font-bold">English (en)</b></span>
                      </div>
                      <p className="mt-1.5 text-slate-700 font-mono text-[10px] leading-relaxed bg-white p-2 rounded border border-slate-200">
                        {group.bodyText}
                      </p>
                      <button
                        type="button"
                        onClick={() => copyText(group.key, group.bodyText)}
                        className="mt-2 inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 border border-slate-300 hover:bg-slate-100 transition"
                      >
                        {copiedKey === group.key ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                        <span>{copiedKey === group.key ? "Copied to clipboard!" : "Copy body for Meta"}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Footer & Action */}
              <div className="mt-3 pt-2.5 border-t border-slate-100">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
                  <div className="flex items-center gap-2">
                    <span><b className="text-slate-900 font-bold">{group.queued}</b> queued</span>
                    <span className="text-slate-300">·</span>
                    <span><b className="text-slate-900 font-bold">{group.failed}</b> failed</span>
                  </div>
                </div>

                {!group.approved && (
                  <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-2 text-xs">
                    <label className="flex items-start gap-1.5 cursor-pointer text-[10px] font-medium text-amber-950">
                      <input
                        type="checkbox"
                        className="size-3.5 mt-0.5 rounded border-amber-300 text-teal-600"
                        checked={Boolean(confirmed[group.key])}
                        onChange={(event) =>
                          setConfirmed({ ...confirmed, [group.key]: event.target.checked })
                        }
                      />
                      <span>
                        I confirm this exact template shows <strong className="font-bold text-slate-900">Active</strong> in WhatsApp Manager.
                      </span>
                    </label>
                    <button
                      onClick={() => activateGroup(group.key)}
                      disabled={!confirmed[group.key] || busy === group.key}
                      className="mt-2 w-full inline-flex h-7.5 items-center justify-center rounded-md bg-slate-900 px-2.5 text-[11px] font-bold text-white shadow-2xs transition hover:bg-slate-800 disabled:opacity-40"
                    >
                      {busy === group.key ? "Activating…" : "Activate in OmniRelay"}
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Safety rule footer */}
      <footer className="flex items-start gap-2 border-t border-slate-100 bg-amber-50/40 px-4 py-2.5 text-xs text-amber-950">
        <b className="font-bold shrink-0 text-amber-800">Safety note:</b>
        <span className="text-[11px] font-medium text-amber-900 leading-relaxed">
          &quot;Active in OmniRelay&quot; allows automated queues to attempt delivery. A green verification badge appears as soon as Meta confirms real patient delivery from your connected WhatsApp number.
        </span>
      </footer>
    </section>
  );
}
