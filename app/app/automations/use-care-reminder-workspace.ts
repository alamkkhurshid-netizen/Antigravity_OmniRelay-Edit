import { useDeferredValue, useMemo, useState } from "react";
import { Patient, Prescription, Reminder, ReminderRun, TemplateReadiness, ChannelReadiness, Adherence } from "./types";

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));

export function useCareReminderWorkspace({
  patients, prescriptions, reminders, runs, templates, channels, adherence, nowIso,
}: {
  patients: Patient[]; prescriptions: Prescription[]; reminders: Reminder[];
  runs: ReminderRun[]; templates: TemplateReadiness[]; channels: ChannelReadiness[];
  adherence: Adherence[]; nowIso: string;
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

  return {
    patientId, setPatientId, prescriptionId, setPrescriptionId, medicineId, setMedicineId,
    kind, setKind, open, setOpen, view, setView, query, setQuery, saving, error, setError,
    patientMap, patientPrescriptions, selectedPrescription, active, ready, delivered,
    whatsappConnected, approvedTemplates, runByReminder, prescriptionMap, medicineMap,
    needsAttention, acknowledged, needsClinicalFollowup, failed, visibleReminders, runRows,
    selectPrescription, createReminder, changeStatus, actOnRun
  };
}
