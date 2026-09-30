import { useCallback, useEffect, useMemo, useState } from "react";
import { RegisteredConsultant, RosterRow, OpsAlert, ImportRow, Preview } from "./types";

export const template =
  "doctor_name,specialization,department,contact_phone,contact_email,chamber,weekdays,start_time,end_time,slot_duration_minutes\nDr Asha Sen,Cardiology,Cardiology,+919900001001,asha@example.com,Chamber 1,1|3|5,12:00,16:00,20\n";

export function queueErrorMessage(status: number, error?: string) {
  if (status === 403)
    return "Only a clinic administrator can manage doctor queue notifications. Ask an administrator to complete this action.";
  if (status === 429)
    return "This safety limit has been reached. Wait a little before trying again; no queue message was sent.";
  return error ?? "Queue notification could not be scheduled safely.";
}

export function parseCsv(text: string): ImportRow[] {
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

export function useClinicOperations(today: string) {
  const [date, setDate] = useState(today);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [consultants, setConsultants] = useState<RegisteredConsultant[]>([]);
  const [activeTab, setActiveTab] = useState<"roster" | "consultants">("roster");
  const [searchQuery, setSearchQuery] = useState("");
  const [updated, setUpdated] = useState("");
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [alerts, setAlerts] = useState<OpsAlert[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [queueBusy, setQueueBusy] = useState("");
  const [queueMessage, setQueueMessage] = useState("");
  const [preflightMessage, setPreflightMessage] = useState("");
  const [consentRow, setConsentRow] = useState<RosterRow | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

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

  async function setQueue(row: RosterRow, enabled: boolean, acknowledged = false) {
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

  return {
    date, setDate, roster, setRoster, consultants, setConsultants, activeTab, setActiveTab,
    searchQuery, setSearchQuery, updated, setUpdated, loading, setLoading, departments,
    setDepartments, departmentFilter, setDepartmentFilter, alerts, setAlerts, rows, setRows,
    preview, setPreview, message, setMessage, busy, setBusy, queueBusy, setQueueBusy,
    queueMessage, setQueueMessage, preflightMessage, setPreflightMessage, consentRow, setConsentRow,
    consentChecked, setConsentChecked, changeDay, dayInfo, loadRoster, visibleRoster, totals,
    validate, download, setQueue, sendQueue, runPreDispatchCheck, filteredConsultants, jumpToShiftDay, jumpToDate
  };
}
