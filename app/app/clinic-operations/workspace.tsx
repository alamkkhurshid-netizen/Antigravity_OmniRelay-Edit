"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  return (
    <div className="mx-auto grid max-w-7xl gap-5 pb-12">
      <section className="grid gap-5 overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_82%_12%,rgba(51,198,221,.42),transparent_26%),linear-gradient(115deg,#06182e,#0b4263)] px-6 py-7 text-white shadow-[0_18px_48px_rgba(7,19,38,.14)] sm:px-8 xl:grid-cols-[1fr_auto] xl:items-end">
        <div>
          <span className="text-xs font-black tracking-[.18em] text-teal-300">MULTI-DOCTOR OPERATIONS</span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Today’s roster and live bookings</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-200">
            One operational view across departments, visiting doctors, chambers,
            shifts and patient flow.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className="inline-flex min-h-10 items-center rounded-xl bg-white px-3 text-sm font-bold text-primary hover:bg-slate-100" onClick={runPreDispatchCheck}>Run pre-dispatch check</button>
          <label>
            Department
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              <option value="">All departments</option>
              {departments.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Roster date
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>
      </section>
      {preflightMessage && <p className="form-message" role="status">{preflightMessage}</p>}
      <section className="roster-metrics">
        <article>
          <span>Doctors visiting</span>
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
