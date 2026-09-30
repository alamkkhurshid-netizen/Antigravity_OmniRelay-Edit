"use client";

import { Adherence, Patient } from "@/app/app/automations/types";

interface AdherencePanelProps {
  adherence: Adherence[];
  patientMap: Map<string, Patient>;
}

export function AdherencePanel({ adherence, patientMap }: AdherencePanelProps) {
  return (
    <section className="adherence-panel">
      <header>
        <div>
          <span className="app-eyebrow">30-DAY MEDICATION ADHERENCE</span>
          <h3>Patient dose responses</h3>
        </div>
        <small>Calculated only from Taken and Skipped replies</small>
      </header>
      {adherence.length === 0 ? (
        <div className="care-empty">
          <b>No dose responses yet</b>
          <span>Results appear after a patient replies TAKEN, SKIP, SNOOZE or HELP.</span>
        </div>
      ) : (
        <div className="adherence-grid">
          {adherence.map((row) => (
            <article key={row.patient_id}>
              <div>
                <b>{patientMap.get(row.patient_id)?.full_name ?? "Patient"}</b>
                <span>{row.total_doses} dose reminders</span>
              </div>
              <strong>{row.adherence_percent === null ? "—" : `${row.adherence_percent}%`}</strong>
              <small>
                <i className="taken">{row.taken_doses} taken</i>
                <i className="skipped">{row.skipped_doses} skipped</i>
                <i>{row.snoozed_doses} snoozed</i>
                {row.help_requests ? <i className="help">{row.help_requests} help</i> : null}
              </small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
