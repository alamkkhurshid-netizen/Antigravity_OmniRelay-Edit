"use client";

import { Patient, Prescription, Medicine, Reminder, ReminderRun } from "@/app/app/automations/types";
import { formatDate } from "@/app/app/automations/use-care-reminder-workspace";

interface CareReminderPanelProps {
  query: string;
  setQuery: (val: string) => void;
  view: "attention" | "active" | "paused" | "all";
  setView: (val: "attention" | "active" | "paused" | "all") => void;
  visibleReminders: Reminder[];
  patientMap: Map<string, Patient>;
  prescriptionMap: Map<string, Prescription>;
  medicineMap: Map<string, Medicine>;
  runByReminder: Map<string, ReminderRun>;
  changeStatus: (id: string, status: "active" | "paused" | "cancelled") => void;
}

export function CareReminderPanel({
  query, setQuery, view, setView, visibleReminders, patientMap, prescriptionMap, medicineMap, runByReminder, changeStatus
}: CareReminderPanelProps) {
  return (
    <section className="care-reminder-panel">
      <header>
        <div><span className="app-eyebrow">MEDICATION & FOLLOW-UP OPERATIONS</span><h3>Reminder schedules</h3></div>
        <div className="reminder-controls">
          <label>
            <span className="sr-only">Search reminders</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient or medicine" />
          </label>
          <div className="segmented" aria-label="Filter reminder schedules">
            {(["attention","active","paused","all"] as const).map((item) => (
              <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)}>
                {item === "attention" ? "Needs attention" : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
        </div>
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
                  <i className={`care-status care-status-${latestRun?.status === "failed" ? "cancelled" : item.status}`}>
                    {latestRun?.status === "failed" ? "delivery failed" : !item.consent_snapshot ? "consent blocked" : item.status}
                  </i>
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
  );
}
