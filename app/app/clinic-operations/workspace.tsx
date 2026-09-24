"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DoctorRosterImportModal } from "@/components/doctor-roster-import-modal";
import { Calendar, Users, ChevronLeft, ChevronRight, Search, Clock, MapPin, Phone, Mail, CheckCircle2, UserCheck, Stethoscope } from "lucide-react";

type RegisteredConsultant = {
  id: string;
  name: string;
  specialization: string;
  phone: string;
  email: string;
  queueEnabled: boolean;
  active: boolean;
  chambers: string[];
  shifts: Array<{
    id: string;
    weekday: number;
    dayLabel: string;
    startTime: string;
    endTime: string;
    slotMinutes: number;
    chamber: string;
  }>;
  scheduleSummary: string;
};


type RosterRow = {
  id: string;
  resourceId: string;
  doctor: string;
  specialization: string;
  department: string;
  departmentId: string | null;
  chamber: string;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  capacity: number;
  booked: number;
  empty: number;
  arrived: number;
  waiting: number;
  inConsultation: number;
  completed: number;
  noShow: number;
  doctorPhone: string | null;
  queueEnabled: boolean;
  dispatch: {
    status: string;
    failure_reason: string | null;
    scheduled_for: string;
    updated_at: string;
  } | null;
  exceptions: Array<{
    id: string;
    type: string;
    reason: string;
    startsAt: string;
    endsAt: string;
  }>;
};
type OpsAlert = {
  key: string;
  severity: "warning" | "critical";
  title: string;
  detail: string;
};
type ImportRow = {
  doctor_name: string;
  specialization: string;
  department?: string;
  contact_phone: string;
  contact_email: string;
  chamber: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
};
type Preview = {
  valid: boolean;
  committed: boolean;
  row_count: number;
  imported_count?: number;
  rows?: Array<ImportRow & { row: number }>;
  errors: Array<{ row: number; field: string; message: string }>;
};
const template =
  "doctor_name,specialization,department,contact_phone,contact_email,chamber,weekdays,start_time,end_time,slot_duration_minutes\nDr Asha Sen,Cardiology,Cardiology,+919900001001,asha@example.com,Chamber 1,1|3|5,12:00,16:00,20\n";

function queueErrorMessage(status: number, error?: string) {
  if (status === 403)
    return "Only a clinic administrator can manage doctor queue notifications. Ask an administrator to complete this action.";
  if (status === 429)
    return "This safety limit has been reached. Wait a little before trying again; no queue message was sent.";
  return error ?? "Queue notification could not be scheduled safely.";
}

function parseCsv(text: string): ImportRow[] {
  const records: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) records.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field);
  if (row.some(Boolean)) records.push(row);
  const headers = (records.shift() ?? []).map((item) =>
    item.trim().toLowerCase(),
  );
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
  if (required.some((key) => !headers.includes(key)))
    throw new Error(
      "Use the OmniRelay template without changing its column names.",
    );
  return records.map((values) => {
    const get = (key: string) =>
      String(values[headers.indexOf(key)] ?? "").trim();
    return {
      doctor_name: get("doctor_name"),
      specialization: get("specialization"),
      department: headers.includes("department") ? get("department") : "",
      contact_phone: get("contact_phone"),
      contact_email: get("contact_email"),
      chamber: get("chamber"),
      weekdays: get("weekdays").split(/[|;/]/).map(Number),
      start_time: get("start_time"),
      end_time: get("end_time"),
      slot_duration_minutes: Number(get("slot_duration_minutes")),
    };
  });
}

export function ClinicOperationsWorkspace({ today }: { today: string }) {
  const [date, setDate] = useState(today),
    [roster, setRoster] = useState<RosterRow[]>([]),
    [consultants, setConsultants] = useState<RegisteredConsultant[]>([]),
    [activeTab, setActiveTab] = useState<"roster" | "consultants">("roster"),
    [searchQuery, setSearchQuery] = useState(""),
    [updated, setUpdated] = useState(""),
    [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<string[]>([]),
    [departmentFilter, setDepartmentFilter] = useState(""),
    [alerts, setAlerts] = useState<OpsAlert[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]),
    [preview, setPreview] = useState<Preview | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [queueBusy, setQueueBusy] = useState(""),
    [queueMessage, setQueueMessage] = useState(""),
    [preflightMessage, setPreflightMessage] = useState(""),
    [consentRow, setConsentRow] = useState<RosterRow | null>(null),
    [consentChecked, setConsentChecked] = useState(false);

  function changeDay(deltaDays: number) {
    const [y, m, d] = date.split("-").map(Number);
    const current = new Date(y, m - 1, d);
    current.setDate(current.getDate() + deltaDays);
    const nextY = current.getFullYear();
    const nextM = String(current.getMonth() + 1).padStart(2, "0");
    const nextD = String(current.getDate()).padStart(2, "0");
    setDate(`${nextY}-${nextM}-${nextD}`);
  }

  function getDayInfo(dateString: string) {
    const [y, m, d] = dateString.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const weekdayName = new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(dt);
    const formatted = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(dt);
    return { weekdayName, formatted, isToday: dateString === today };
  }

  const dayInfo = useMemo(() => getDayInfo(date), [date, today]);

  const loadRoster = useCallback(
    async (selected = date) => {
      setLoading(true);
      const response = await fetch(
        `/api/clinic-operations/roster?date=${selected}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (response.ok) {
        setRoster(data.rows);
        setDepartments(data.departments ?? []);
        setAlerts(data.alerts ?? []);
        setUpdated(data.updatedAt);
        if (data.consultants) {
          setConsultants(data.consultants);
        }
      }
      setLoading(false);
    },
    [date],
  );
  useEffect(() => {
    const initial = window.setTimeout(() => loadRoster(date), 0);
    const timer = window.setInterval(() => loadRoster(date), 30000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [date, loadRoster]);
  const visibleRoster = useMemo(
    () =>
      departmentFilter
        ? roster.filter((row) => row.department === departmentFilter)
        : roster,
    [departmentFilter, roster],
  );
  const totals = useMemo(
    () =>
      visibleRoster.reduce(
        (sum, row) => ({
          capacity: sum.capacity + row.capacity,
          booked: sum.booked + row.booked,
          empty: sum.empty + row.empty,
          arrived: sum.arrived + row.arrived,
          completed: sum.completed + row.completed,
        }),
        { capacity: 0, booked: 0, empty: 0, arrived: 0, completed: 0 },
      ),
    [visibleRoster],
  );
  async function validate(commit = false) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/clinic-operations/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows, commit, sourceFormat: "csv" }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Import could not be checked.");
      setBusy(false);
      return;
    }
    setPreview(data);
    if (data.committed) {
      setMessage(
        `${data.imported_count} doctors and schedules imported successfully.`,
      );
      setRows([]);
      await loadRoster();
    }
    setBusy(false);
  }
  function download() {
    const blob = new Blob([template], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "omnirelay-doctor-import-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  async function setQueue(
    row: RosterRow,
    enabled: boolean,
    acknowledged = false,
  ) {
    setQueueBusy(row.resourceId);
    setQueueMessage("");
    const response = await fetch("/api/clinic-operations/doctor-queue", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceId: row.resourceId,
        enabled,
        acknowledged,
      }),
    });
    const data = await response.json();
    setQueueMessage(
      response.ok
        ? enabled
          ? `${row.doctor} queue notifications enabled with consent evidence recorded.`
          : `${row.doctor} queue notifications disabled; withdrawal evidence recorded.`
        : queueErrorMessage(response.status, data.error),
    );
    if (response.ok) {
      setConsentRow(null);
      setConsentChecked(false);
      await loadRoster();
    }
    setQueueBusy("");
  }
  async function sendQueue(row: RosterRow) {
    setQueueBusy(row.id);
    setQueueMessage("");
    const response = await fetch("/api/clinic-operations/doctor-queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ruleId: row.id, shiftDate: date }),
    });
    const data = await response.json();
    setQueueMessage(
      response.ok
        ? `${row.doctor} queue notification scheduled safely.`
        : queueErrorMessage(response.status, data.error),
    );
    if (response.ok) await loadRoster();
    setQueueBusy("");
  }
  function runPreDispatchCheck() {
    const missingPhone = visibleRoster.filter((row) => !row.doctorPhone).length;
    const missingConsent = visibleRoster.filter((row) => Boolean(row.doctorPhone) && !row.queueEnabled).length;
    const exceptions = visibleRoster.filter((row) => row.exceptions.length > 0 || row.dispatch?.status === "failed").length;
    setPreflightMessage(
      missingPhone || missingConsent || exceptions
        ? `Hold dispatch: ${missingPhone} missing number · ${missingConsent} consent not recorded · ${exceptions} schedule or delivery exception${exceptions === 1 ? "" : "s"}.`
        : `Pre-dispatch check passed for ${visibleRoster.length} scheduled session${visibleRoster.length === 1 ? "" : "s"}. Queue messages remain subject to their normal one-hour timing.`,
    );
  }

  const filteredConsultants = useMemo(() => {
    if (!searchQuery.trim()) return consultants;
    const q = searchQuery.toLowerCase().trim();
    return consultants.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.specialization.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.chambers.some((ch) => ch.toLowerCase().includes(q)) ||
        c.shifts.some((s) => s.dayLabel.toLowerCase().includes(q)),
    );
  }, [consultants, searchQuery]);

  function jumpToShiftDay(targetWeekday: number) {
    const [y, m, d] = date.split("-").map(Number);
    const current = new Date(y, m - 1, d);
    const currentDay = current.getDay();
    let diff = targetWeekday - currentDay;
    if (diff <= 0) diff += 7;
    current.setDate(current.getDate() + diff);
    const nextY = current.getFullYear();
    const nextM = String(current.getMonth() + 1).padStart(2, "0");
    const nextD = String(current.getDate()).padStart(2, "0");
    setDate(`${nextY}-${nextM}-${nextD}`);
    setActiveTab("roster");
  }

  function jumpToDate(targetDate: string) {
    setDate(targetDate);
    setActiveTab("roster");
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-5 pb-12">
      <section className="grid gap-5 overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_82%_12%,rgba(51,198,221,.42),transparent_26%),linear-gradient(115deg,#06182e,#0b4263)] px-6 py-7 text-white shadow-[0_18px_48px_rgba(7,19,38,.14)] sm:px-8 xl:grid-cols-[1fr_auto] xl:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black tracking-[.18em] text-teal-300">
              MULTI-DOCTOR OPERATIONS
            </span>
            <span className="rounded-md bg-teal-500/20 border border-teal-300/30 px-2 py-0.5 text-[11px] font-bold text-teal-200">
              {dayInfo.weekdayName}, {dayInfo.formatted} {dayInfo.isToday && "· Today"}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {dayInfo.isToday ? "Today’s" : `${dayInfo.weekdayName}’s`} roster and live bookings
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-200">
            One operational view across departments, visiting doctors, chambers,
            shifts and patient flow.
          </p>

          {/* Quick Date Stepper Navigation */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1 backdrop-blur-md border border-white/10">
              <button
                type="button"
                onClick={() => changeDay(-1)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-100 hover:bg-white/20 transition-colors"
                title="Previous Day"
              >
                ◀ Prev Day
              </button>
              <button
                type="button"
                onClick={() => setDate(today)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  date === today
                    ? "bg-teal-400 text-slate-950 shadow-sm"
                    : "text-white hover:bg-white/20"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => changeDay(1)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-100 hover:bg-white/20 transition-colors"
                title="Next Day"
              >
                Next Day ▶
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-teal-200 font-semibold bg-white/5 rounded-xl px-3 py-2 border border-white/10">
              <span>Date:</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-900 shadow-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <DoctorRosterImportModal
            triggerClassName="inline-flex min-h-10 items-center gap-2 rounded-xl bg-teal-500 hover:bg-teal-400 px-3.5 text-sm font-bold text-slate-900 transition-colors shadow-sm"
            triggerLabel="Upload Doctor Roster (CSV)"
            onSuccess={() => loadRoster()}
          />
          <button
            type="button"
            className="inline-flex min-h-10 items-center rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 px-3 text-xs font-bold text-white transition-colors"
            onClick={runPreDispatchCheck}
          >
            Pre-dispatch check
          </button>
          <label className="text-xs font-bold text-slate-200">
            Department
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className="mt-1 block min-h-10 rounded-xl bg-white px-3 text-xs font-bold text-slate-900 shadow-sm"
            >
              <option value="">All departments</option>
              {departments.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* View Switcher Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("roster")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              activeTab === "roster"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
            }`}
          >
            <span>📅 Visiting Roster for {dayInfo.weekdayName}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
                activeTab === "roster"
                  ? "bg-teal-400 text-slate-950"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {new Set(visibleRoster.map((r) => r.doctor)).size} Doctors ({visibleRoster.length} Shifts)
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("consultants")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              activeTab === "consultants"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
            }`}
          >
            <span>👥 All Registered Visiting Consultants</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
                activeTab === "consultants"
                  ? "bg-teal-400 text-slate-950"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {consultants.length} Doctors Registered
            </span>
          </button>
        </div>

        {activeTab === "roster" ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span>Roster Date:</span>
            <span className="rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-teal-800 font-bold">
              {dayInfo.weekdayName}, {dayInfo.formatted} {dayInfo.isToday ? "(Today)" : ""}
            </span>
          </div>
        ) : (
          <div className="text-xs font-semibold text-slate-500">
            Showing all <b>{consultants.length}</b> visiting consultants associated with this clinic
          </div>
        )}
      </div>

      {preflightMessage && activeTab === "roster" && (
        <p className="form-message" role="status">
          {preflightMessage}
        </p>
      )}

      {activeTab === "roster" && (
        <>
          <section className="roster-metrics">
            <article>
              <span>Doctors visiting ({dayInfo.weekdayName.slice(0, 3)})</span>
              <b>{new Set(visibleRoster.map((row) => row.doctor)).size}</b>
              <small>
                {visibleRoster.length} scheduled session
                {visibleRoster.length === 1 ? "" : "s"}
              </small>
            </article>
            <article>
              <span>Booked</span>
              <b>
                {totals.booked}/{totals.capacity}
              </b>
              <small>Appointments / capacity</small>
            </article>
            <article>
              <span>Empty slots</span>
              <b>{totals.empty}</b>
              <small>Available capacity</small>
            </article>
            <article>
              <span>Patient flow</span>
              <b>{totals.arrived + totals.completed}</b>
              <small>
                {totals.arrived} arrived · {totals.completed} completed
              </small>
            </article>
          </section>
          {alerts.length > 0 && (
            <section className="clinic-ops-alerts">
              <header>
                <div>
                  <span className="app-eyebrow">ACTION REQUIRED</span>
                  <h3>Roster and queue exceptions</h3>
                </div>
                <b>{alerts.length}</b>
              </header>
              <div>
                {alerts.map((alert) => (
                  <article className={alert.severity} key={alert.key}>
                    <i>!</i>
                    <div>
                      <b>{alert.title}</b>
                      <span>{alert.detail}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
      <section className="live-roster">
        <header>
          <div>
            <span className="app-eyebrow">TODAY’S VISITING ROSTER</span>
            <h3>Department and doctor booking density</h3>
          </div>
          <small>
            {loading
              ? "Refreshing…"
              : updated
                ? `Updated ${new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(updated))}`
                : ""}
          </small>
        </header>
        {!visibleRoster.length ? (
          <div className="roster-empty">
            No visiting-doctor sessions match this date and department.
          </div>
        ) : (
          <div className="roster-grid">
            {visibleRoster.map((row) => (
              <article key={row.id}>
                <header>
                  <div>
                    <small>{row.department}</small>
                    <b>{row.doctor}</b>
                    <span>
                      {row.specialization} · {row.chamber}
                    </span>
                  </div>
                  <time>
                    {row.startTime}–{row.endTime}
                  </time>
                </header>
                {row.exceptions.length > 0 && <p className="roster-exception">{row.exceptions[0].type}: {row.exceptions[0].reason}</p>}
                <div className="density">
                  <i
                    style={{
                      width: `${row.capacity ? Math.min(100, (row.booked / row.capacity) * 100) : 0}%`,
                    }}
                  />
                  <span>{row.booked} booked</span>
                  <span>{row.empty} empty</span>
                </div>
                <dl>
                  <div>
                    <dt>Arrived</dt>
                    <dd>{row.arrived}</dd>
                  </div>
                  <div>
                    <dt>In consultation</dt>
                    <dd>{row.inConsultation}</dd>
                  </div>
                  <div>
                    <dt>Completed</dt>
                    <dd>{row.completed}</dd>
                  </div>
                  <div>
                    <dt>No-show</dt>
                    <dd>{row.noShow}</dd>
                  </div>
                </dl>
                <div className="doctor-queue-control">
                  <div>
                    <b>WhatsApp queue</b>
                    <span>
                      {!row.doctorPhone
                        ? "Doctor number missing"
                        : row.dispatch
                          ? `Dispatch: ${row.dispatch.status}`
                          : row.queueEnabled
                            ? "Automatic · 1 hour before shift"
                            : "Consent not recorded"}
                    </span>
                    {row.dispatch?.failure_reason && (
                      <small>{row.dispatch.failure_reason}</small>
                    )}
                  </div>
                  <nav>
                    {!row.doctorPhone ? (
                      <Link className="queue-action-link" href="/app/settings">
                        Add doctor number
                      </Link>
                    ) : row.dispatch?.status === "failed" ? (
                      <Link className="queue-action-link" href="/app/operations">
                        Review delivery failure
                      </Link>
                    ) : row.queueEnabled ? (
                      <>
                        <button
                          type="button"
                          disabled={queueBusy !== "" || Boolean(row.dispatch)}
                          onClick={() => sendQueue(row)}
                        >
                          {row.dispatch
                            ? "Already scheduled"
                            : "Send queue now"}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={queueBusy !== ""}
                          onClick={() => setQueue(row, false)}
                        >
                          Disable
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={queueBusy !== "" || !row.doctorPhone}
                        onClick={() => {
                          setConsentRow(row);
                          setConsentChecked(false);
                        }}
                      >
                        Review consent
                      </button>
                    )}
                  </nav>
                </div>
              </article>
            ))}
          </div>
        )}
        {consentRow && (
          <div
            className="queue-consent-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setConsentRow(null);
                setConsentChecked(false);
              }
            }}
          >
            <aside
              className="queue-consent-confirm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="queue-consent-title"
            >
              <b id="queue-consent-title">
                Confirm consent for {consentRow.doctor}
              </b>
              <span>
                The doctor agreed to receive operational shift and booking-count
                notifications on {consentRow.doctorPhone}. Messages exclude
                patient names and clinical information. Consent can be withdrawn
                at any time.
              </span>
              <label>
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(event) => setConsentChecked(event.target.checked)}
                />{" "}
                I confirm the doctor explicitly agreed to this WhatsApp use.
              </label>
              <nav>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setConsentRow(null);
                    setConsentChecked(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!consentChecked || queueBusy !== ""}
                  onClick={() => setQueue(consentRow, true, true)}
                >
                  Record evidence & enable
                </button>
              </nav>
            </aside>
          </div>
        )}
        {queueMessage && (
          <p className="form-message" role="status">
            {queueMessage}
          </p>
        )}
        <aside className="queue-consent-notice">
          <b>Doctor WhatsApp consent notice v1</b>
          <span>
            Every enablement and withdrawal is recorded as immutable evidence.
            Messages exclude patient names and clinical information.
          </span>
        </aside>
      </section>
        </>
      )}

      {activeTab === "consultants" && (
        <section className="grid gap-5">
          {/* Search and Summary bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-1 items-center gap-3 min-w-[280px]">
              <span className="text-lg">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by doctor name, specialty, chamber, weekday (e.g. Mon, Thu), or phone..."
                className="w-full text-sm font-medium text-slate-900 placeholder:text-slate-400 bg-transparent border-0 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700 font-bold">
                {filteredConsultants.length} Doctor{filteredConsultants.length === 1 ? "" : "s"} shown
              </span>
              <span className="hidden sm:inline">· Click any recurring shift badge to jump directly to that day’s live roster</span>
            </div>
          </div>

          {filteredConsultants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
              <p className="text-base font-bold text-slate-700">No visiting consultants match &ldquo;{searchQuery}&rdquo;</p>
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
                            {doc.phone || <em className="text-slate-400">Not recorded</em>}
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
                            <span className="font-medium text-slate-700 truncate">{doc.email}</span>
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
                            <span className="text-xs text-slate-400 italic">No recurring shift days configured</span>
                          ) : (
                            doc.shifts.map((shift) => (
                              <button
                                key={shift.id}
                                type="button"
                                onClick={() => jumpToShiftDay(shift.weekday)}
                                className="group flex items-center gap-1.5 rounded-lg bg-slate-50 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 px-2.5 py-1.5 text-xs transition-colors text-left"
                                title={`Jump to next ${shift.dayLabel} roster`}
                              >
                                <b className="text-slate-900 group-hover:text-teal-800">{shift.dayLabel}</b>
                                <span className="text-slate-600">{shift.startTime}–{shift.endTime}</span>
                                <span className="text-[10px] text-teal-700 font-semibold">({shift.chamber})</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-medium">
                        {doc.shifts.length} weekly recurring session{doc.shifts.length === 1 ? "" : "s"}
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
      )}

      <section className="doctor-import">
        <header>
          <div>
            <span className="app-eyebrow">BULK ONBOARDING</span>
            <h3>Import doctors and recurring schedules</h3>
            <p>
              Preview every row before one atomic commit. Existing doctor
              profiles are never overwritten.
            </p>
          </div>
          <button type="button" className="secondary-button" onClick={download}>
            Download CSV template
          </button>
        </header>
        <label className="import-drop">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const parsed = parseCsv(await file.text());
                setRows(parsed);
                setPreview(null);
                setMessage(
                  `${parsed.length} rows loaded. Run validation before import.`,
                );
              } catch (error) {
                setRows([]);
                setPreview(null);
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "CSV could not be read.",
                );
              }
            }}
          />
          <b>Choose doctor roster CSV</b>
          <span>Maximum 200 rows · no patient data</span>
        </label>
        {rows.length > 0 && (
          <div className="import-actions">
            <span>{rows.length} rows ready</span>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => validate(false)}
            >
              {busy ? "Checking…" : "Validate & preview"}
            </button>
            {preview?.valid && (
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => validate(true)}
              >
                Import all doctors
              </button>
            )}
          </div>
        )}
        {preview && (
          <div
            className={
              preview.valid ? "import-result valid" : "import-result invalid"
            }
          >
            <b>
              {preview.valid ? "All rows passed validation" : "Import blocked"}
            </b>
            <span>
              {preview.valid
                ? `${preview.row_count} doctors are ready for atomic import.`
                : `Fix ${preview.errors.length} validation issue${preview.errors.length === 1 ? "" : "s"}. No changes were made.`}
            </span>
            {preview.errors.length > 0 && (
              <ul>
                {preview.errors.slice(0, 20).map((error, index) => (
                  <li key={`${error.row}-${error.field}-${index}`}>
                    <strong>
                      Row {error.row} · {error.field}
                    </strong>
                    {error.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
