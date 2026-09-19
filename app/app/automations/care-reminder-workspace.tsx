"use client";

import { useDeferredValue, useMemo, useState } from "react";

type Patient = {
  id: string;
  full_name: string;
  phone: string | null;
  care_communications_consent: boolean;
};
type Medicine = {
  id: string;
  medicine_name: string;
  dosage: string | null;
  frequency: string;
  duration: string | null;
  instructions: string | null;
};
type Prescription = {
  id: string;
  patient_id: string;
  prescription_number: string;
  items: Medicine[];
};
type Reminder = {
  id: string;
  patient_id: string;
  prescription_id: string | null;
  prescription_item_id: string | null;
  reminder_type: string;
  title: string;
  instructions: string | null;
  schedule_kind: "one_time" | "daily";
  scheduled_for: string | null;
  time_of_day: string | null;
  starts_on: string | null;
  ends_on: string | null;
  channel: string;
  status: string;
  consent_snapshot: boolean;
  next_run_at: string;
  last_run_at: string | null;
  created_at: string;
};
type ReminderRun = {
  id: string;
  reminder_id: string;
  patient_id: string;
  scheduled_for: string;
  channel: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  failure_reason: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  approved_at: string | null;
  acknowledged_at: string | null;
  acknowledgement: string | null;
  response_kind: "confirmed" | "missed" | "snoozed" | "help" | null;
  response_text: string | null;
  response_received_at: string | null;
  created_at: string;
};
type TemplateReadiness = { event_type: string; provider_template_name: string; status: string };
type ChannelReadiness = { channel: string; status: string };
type Adherence = {
  patient_id: string;
  total_doses: number;
  taken_doses: number;
  skipped_doses: number;
  snoozed_doses: number;
  help_requests: number;
  adherence_percent: number | null;
  last_response_at: string | null;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));

export function CareReminderWorkspace({
  patients,
  prescriptions,
  reminders,
  runs,
  templates,
  channels,
  adherence,
  nowIso,
}: {
  patients: Patient[];
  prescriptions: Prescription[];
  reminders: Reminder[];
  runs: ReminderRun[];
  templates: TemplateReadiness[];
  channels: ChannelReadiness[];
  adherence: Adherence[];
  nowIso: string;
}) {
  const [reminderRows, setReminderRows] = useState(reminders);
  const [runRows, setRunRows] = useState(runs);
  const [patientId, setPatientId] = useState(patients[0]?.id ?? "");
  const [prescriptionId, setPrescriptionId] = useState("");
  const [medicineId, setMedicineId] = useState("");
  const [kind, setKind] = useState<"one_time" | "daily">("one_time");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"attention" | "active" | "paused" | "all">("attention");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const now = new Date(nowIso).getTime();
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const patientMap = useMemo(() => new Map(patients.map((item) => [item.id, item])), [patients]);
  const patientPrescriptions = prescriptions.filter((item) => item.patient_id === patientId);
  const selectedPrescription = patientPrescriptions.find((item) => item.id === prescriptionId);
  const active = reminderRows.filter((item) => item.status === "active");
  const ready = runRows.filter((item) => ["ready", "approved"].includes(item.status)).length;
  const delivered = runRows.filter((item) => ["delivered", "read"].includes(item.status)).length;
  const whatsappConnected = channels.some((item) => item.channel === "whatsapp" && ["test", "live", "connected"].includes(item.status));
  const approvedTemplates = templates.filter((item) => item.status === "approved");
  const runByReminder = useMemo(() => {
    const result = new Map<string, ReminderRun>();
    for (const run of runRows) if (!result.has(run.reminder_id)) result.set(run.reminder_id, run);
    return result;
  }, [runRows]);
  const prescriptionMap = useMemo(() => new Map(prescriptions.map((item) => [item.id, item])), [prescriptions]);
  const medicineMap = useMemo(() => new Map(prescriptions.flatMap((item) => item.items).map((item) => [item.id, item])), [prescriptions]);
  const needsAttention = reminderRows.filter((item) => {
    const run = runByReminder.get(item.id);
    return !item.consent_snapshot || run?.status === "failed" || (item.status === "active" && new Date(item.next_run_at).getTime() <= now + 24 * 60 * 60 * 1000);
  }).length;
  const acknowledged = runRows.filter((item) => item.acknowledged_at).length;
  const needsClinicalFollowup = runRows.filter((item) => ["missed", "help"].includes(item.response_kind ?? "")).length;
  const failed = runRows.filter((item) => item.status === "failed").length;
  const visibleReminders = useMemo(() => reminderRows.filter((item) => {
    const patient = patientMap.get(item.patient_id);
    const medicine = item.prescription_item_id ? medicineMap.get(item.prescription_item_id) : null;
    const run = runByReminder.get(item.id);
    const attention = !item.consent_snapshot || run?.status === "failed" || (item.status === "active" && new Date(item.next_run_at).getTime() <= now + 24 * 60 * 60 * 1000);
    const matchesView = view === "all" || (view === "attention" ? attention : item.status === view);
    const searchable = `${patient?.full_name ?? ""} ${patient?.phone ?? ""} ${item.title} ${item.reminder_type} ${medicine?.medicine_name ?? ""}`.toLowerCase();
    return matchesView && (!deferredQuery || searchable.includes(deferredQuery));
  }), [reminderRows, patientMap, medicineMap, runByReminder, view, deferredQuery, now]);

  function selectPrescription(value: string) {
    setPrescriptionId(value);
    setMedicineId("");
  }

  async function createReminder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const startsOn = String(data.get("startsOn") || "");
    const timeOfDay = String(data.get("timeOfDay") || "");
    const scheduledLocal = String(data.get("scheduledFor") || "");
    const nextRunAt =
      kind === "daily"
        ? new Date(`${startsOn}T${timeOfDay}:00+05:30`).toISOString()
        : new Date(`${scheduledLocal}:00+05:30`).toISOString();
    const response = await fetch("/api/care-reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId,
        prescriptionId: prescriptionId || null,
        prescriptionItemId: medicineId || null,
        reminderType: data.get("reminderType"),
        title: data.get("title"),
        instructions: data.get("instructions"),
        scheduleKind: kind,
        scheduledFor: kind === "one_time" ? nextRunAt : null,
        timeOfDay: kind === "daily" ? timeOfDay : null,
        startsOn: kind === "daily" ? startsOn : null,
        endsOn: kind === "daily" ? data.get("endsOn") || null : null,
        nextRunAt,
        channel: data.get("channel"),
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      reminder?: Reminder;
      error?: string;
    };
    if (!response.ok || !result.reminder) setError(result.error ?? "Reminder could not be created.");
    else {
      setReminderRows((current) => [result.reminder!, ...current]);
      setOpen(false);
      setPrescriptionId("");
      setMedicineId("");
    }
    setSaving(false);
  }

  async function changeStatus(id: string, status: "active" | "paused" | "cancelled") {
    setError("");
    const response = await fetch("/api/care-reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      reminder?: Reminder;
      error?: string;
    };
    if (!response.ok || !result.reminder) setError(result.error ?? "Status could not be changed.");
    else setReminderRows((current) => current.map((item) => (item.id === id ? result.reminder! : item)));
  }

  async function actOnRun(id: string, action: "approve" | "retry" | "skip" | "acknowledge") {
    setError("");
    const response = await fetch("/api/care-reminder-runs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const result = (await response.json().catch(() => ({}))) as { run?: ReminderRun; error?: string };
    if (!response.ok || !result.run) setError(result.error ?? "Dispatch action could not be completed.");
    else setRunRows((current) => current.map((item) => item.id === id ? result.run! : item));
  }

  return (
    <main className="care-automation-page">
      <section className="care-automation-hero">
        <div>
          <span className="app-eyebrow">PATIENT LIFECYCLE</span>
          <h2>Care that continues after the consultation.</h2>
          <p>
            Turn doctor-entered prescriptions and revisit dates into controlled reminder schedules.
            Nothing is sent without recorded care consent.
          </p>
        </div>
        <button onClick={() => setOpen(true)}>＋ New care reminder</button>
      </section>

      <section className="care-metrics">
        <article><span>Active schedules</span><b>{active.length}</b><small>Doctor-approved instructions</small></article>
        <article className={needsAttention ? "warning" : ""}><span>Needs attention</span><b>{needsAttention}</b><small>Due, blocked or failed</small></article>
        <article className={failed ? "danger" : ""}><span>Delivery failures</span><b>{failed}</b><small>{ready} waiting for dispatch</small></article>
        <article className={needsClinicalFollowup ? "warning" : ""}><span>Patient responses</span><b>{acknowledged}</b><small>{needsClinicalFollowup ? `${needsClinicalFollowup} need staff follow-up` : `${delivered} delivered or read`}</small></article>
      </section>

      <section className="adherence-panel">
        <header><div><span className="app-eyebrow">30-DAY MEDICATION ADHERENCE</span><h3>Patient dose responses</h3></div><small>Calculated only from Taken and Skipped replies</small></header>
        {adherence.length === 0 ? <div className="care-empty"><b>No dose responses yet</b><span>Results appear after a patient replies TAKEN, SKIP, SNOOZE or HELP.</span></div> : <div className="adherence-grid">{adherence.map((row) => <article key={row.patient_id}>
          <div><b>{patientMap.get(row.patient_id)?.full_name ?? "Patient"}</b><span>{row.total_doses} dose reminders</span></div>
          <strong>{row.adherence_percent === null ? "—" : `${row.adherence_percent}%`}</strong>
          <small><i className="taken">{row.taken_doses} taken</i><i className="skipped">{row.skipped_doses} skipped</i><i>{row.snoozed_doses} snoozed</i>{row.help_requests ? <i className="help">{row.help_requests} help</i> : null}</small>
        </article>)}</div>}
      </section>

      {error && <p className="care-error">{error}</p>}

      <section className="care-reminder-panel">
        <header>
          <div><span className="app-eyebrow">MEDICATION & FOLLOW-UP OPERATIONS</span><h3>Reminder schedules</h3></div>
          <div className="reminder-controls"><label><span className="sr-only">Search reminders</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient or medicine" /></label><div className="segmented" aria-label="Filter reminder schedules">{(["attention","active","paused","all"] as const).map((item) => <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)}>{item === "attention" ? "Needs attention" : item[0].toUpperCase() + item.slice(1)}</button>)}</div></div>
        </header>
        {visibleReminders.length === 0 ? (
          <div className="care-empty"><b>No schedules match this view</b><span>Create a reminder or change the active filters.</span></div>
        ) : (
          <div className="care-reminder-list">
            {visibleReminders.map((item) => {
              const patient = patientMap.get(item.patient_id);
              const prescription = item.prescription_id ? prescriptionMap.get(item.prescription_id) : null;
              const medicine = item.prescription_item_id ? medicineMap.get(item.prescription_item_id) : null;
              const latestRun = runByReminder.get(item.id);
              return (
                <article key={item.id}>
                  <div className={`care-kind care-kind-${item.reminder_type}`}>
                    {item.reminder_type === "medication" ? "Rx" : "↻"}
                  </div>
                  <div>
                    <b>{item.title}</b>
                    <span>{patient?.full_name ?? "Patient"} · {item.channel}{prescription ? ` · ${prescription.prescription_number}` : ""}</span>
                    {medicine ? <small><b>{medicine.medicine_name}</b>{medicine.dosage ? ` · ${medicine.dosage}` : ""}{medicine.frequency ? ` · ${medicine.frequency}` : ""}</small> : null}
                    {item.instructions && <small>{item.instructions}</small>}
                  </div>
                  <div className="care-next-run">
                    <span>Next reminder</span>
                    <b>{formatDate(item.next_run_at)}</b>
                  </div>
                  <div className="care-reminder-state">
                    <i className={`care-status care-status-${latestRun?.status === "failed" ? "cancelled" : item.status}`}>{latestRun?.status === "failed" ? "delivery failed" : !item.consent_snapshot ? "consent blocked" : item.status}</i>
                    {item.status === "active" ? (
                      <button onClick={() => changeStatus(item.id, "paused")}>Pause</button>
                    ) : item.status === "paused" ? (
                      <button onClick={() => changeStatus(item.id, "active")}>Resume</button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="care-safety-note">
        <span>CONTROLLED AUTOMATION</span>
        <div><b>Schedules are operational—not medical advice.</b><p>The doctor defines every medicine, instruction and time. OmniRelay records consent, queues due reminders and tracks delivery.</p></div>
      </section>

      <section className="care-dispatch-panel">
        <header>
          <div><span className="app-eyebrow">REMINDER OPERATIONS</span><h3>Approval and delivery queue</h3></div>
          <div className="dispatch-readiness">
            <span className={whatsappConnected ? "ready" : "blocked"}>{whatsappConnected ? "● WhatsApp connected" : "● WhatsApp connection required"}</span>
            <span className={approvedTemplates.length ? "ready" : "blocked"}>{approvedTemplates.length ? `${approvedTemplates.length} approved template${approvedTemplates.length === 1 ? "" : "s"}` : "Meta template approval required"}</span>
          </div>
        </header>
        {runRows.length === 0 ? (
          <div className="care-empty"><b>No reminder runs yet</b><span>Runs appear here when a scheduled care reminder becomes due.</span></div>
        ) : (
          <div className="dispatch-table">
            <div className="dispatch-table-head"><span>Patient / schedule</span><span>Channel</span><span>Status</span><span>Attempts</span><span>Action</span></div>
            {runRows.map((run) => {
              const patient = patientMap.get(run.patient_id);
              return (
                <article key={run.id}>
                  <div><b>{patient?.full_name ?? "Patient"}</b><small>{formatDate(run.scheduled_for)}</small></div>
                  <span>{run.channel}</span>
                  <div><i className={`dispatch-status dispatch-status-${run.status}`}>{run.status}</i>{run.response_kind && <small className={`adherence-response adherence-${run.response_kind}`}>{run.response_kind === "confirmed" ? "✓ Taken" : run.response_kind === "missed" ? "! Skipped" : run.response_kind === "snoozed" ? "◷ Snoozed 15 min" : "! Patient requested help"}</small>}{run.response_text && <small>“{run.response_text}”</small>}{run.failure_reason && <small>{run.failure_reason}</small>}</div>
                  <span>{run.attempt_count} / {run.max_attempts}</span>
                  <div className="dispatch-actions">
                    {run.status === "ready" && <button onClick={() => actOnRun(run.id, "approve")}>Approve</button>}
                    {run.status === "failed" && run.attempt_count < run.max_attempts && <button onClick={() => actOnRun(run.id, "retry")}>Retry</button>}
                    {["ready", "failed"].includes(run.status) && <button className="secondary" onClick={() => actOnRun(run.id, "skip")}>Skip</button>}
                    {["delivered", "read"].includes(run.status) && !run.acknowledged_at && <button onClick={() => actOnRun(run.id, "acknowledge")}>Record response</button>}
                    {run.acknowledged_at && <small className="dispatch-ack">✓ {run.response_kind ? "patient response recorded" : "acknowledged"}</small>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {open && (
        <div className="care-modal-backdrop" onClick={() => setOpen(false)}>
          <form className="care-modal" onSubmit={createReminder} onClick={(event) => event.stopPropagation()}>
            <header><div><span className="app-eyebrow">NEW CARE SCHEDULE</span><h3>Schedule a patient reminder</h3></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
            <label>Patient<select value={patientId} onChange={(event) => { setPatientId(event.target.value); selectPrescription(""); }} required><option value="">Select patient</option>{patients.map((patient) => <option value={patient.id} key={patient.id}>{patient.full_name}{patient.phone ? ` · ${patient.phone}` : ""}</option>)}</select></label>
            <label>Reminder type<select name="reminderType" defaultValue="medication"><option value="medication">Medication</option><option value="follow_up">Follow-up / revisit</option><option value="test">Test / investigation</option><option value="care">General care</option></select></label>
            <label>Linked prescription<select value={prescriptionId} onChange={(event) => selectPrescription(event.target.value)}><option value="">No linked prescription</option>{patientPrescriptions.map((item) => <option key={item.id} value={item.id}>{item.prescription_number}</option>)}</select></label>
            <label>Linked medicine<select value={medicineId} onChange={(event) => setMedicineId(event.target.value)}><option value="">No linked medicine</option>{selectedPrescription?.items.map((item) => <option key={item.id} value={item.id}>{item.medicine_name}{item.dosage ? ` · ${item.dosage}` : ""}</option>)}</select></label>
            <label className="wide">Reminder title<input name="title" placeholder="e.g. Take Metformin after breakfast" required /></label>
            <label className="wide">Instructions<textarea name="instructions" rows={3} placeholder="Doctor-approved instruction shown in the reminder" /></label>
            <fieldset className="wide"><legend>Schedule</legend><button type="button" className={kind === "one_time" ? "active" : ""} onClick={() => setKind("one_time")}>One time</button><button type="button" className={kind === "daily" ? "active" : ""} onClick={() => setKind("daily")}>Every day</button></fieldset>
            {kind === "one_time" ? (
              <label className="wide">Date and time<input name="scheduledFor" type="datetime-local" required /></label>
            ) : (
              <>
                <label>Start date<input name="startsOn" type="date" required /></label>
                <label>Reminder time<input name="timeOfDay" type="time" required /></label>
                <label className="wide">End date<input name="endsOn" type="date" /></label>
              </>
            )}
            <label className="wide">Channel<select name="channel" defaultValue="whatsapp"><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="manual">Staff task only</option></select></label>
            {patientId && !patientMap.get(patientId)?.care_communications_consent && <p className="care-consent-warning wide">This patient has not granted care-communication consent. The schedule can be saved, but due runs will be skipped until consent is recorded.</p>}
            {error && <p className="care-error wide">{error}</p>}
            <button className="care-submit wide" disabled={saving || !patientId}>{saving ? "Scheduling…" : "Create care schedule"}</button>
          </form>
        </div>
      )}
    </main>
  );
}
