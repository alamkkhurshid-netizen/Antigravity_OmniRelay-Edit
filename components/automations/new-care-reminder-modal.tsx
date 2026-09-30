"use client";

import { FormEvent } from "react";
import { Patient, Prescription } from "@/app/app/automations/types";

interface NewCareReminderModalProps {
  open: boolean;
  setOpen: (val: boolean) => void;
  patientId: string;
  setPatientId: (val: string) => void;
  selectPrescription: (val: string) => void;
  patients: Patient[];
  prescriptionId: string;
  patientPrescriptions: Prescription[];
  medicineId: string;
  setMedicineId: (val: string) => void;
  selectedPrescription?: Prescription;
  kind: "one_time" | "daily";
  setKind: (val: "one_time" | "daily") => void;
  patientMap: Map<string, Patient>;
  error: string;
  saving: boolean;
  createReminder: (event: FormEvent<HTMLFormElement>) => void;
}

export function NewCareReminderModal({
  open, setOpen, patientId, setPatientId, selectPrescription, patients, prescriptionId, patientPrescriptions, medicineId, setMedicineId, selectedPrescription, kind, setKind, patientMap, error, saving, createReminder
}: NewCareReminderModalProps) {
  if (!open) return null;
  return (
    <div className="care-modal-backdrop" onClick={() => setOpen(false)}>
      <form className="care-modal" onSubmit={createReminder} onClick={(event) => event.stopPropagation()}>
        <header>
          <div><span className="app-eyebrow">NEW CARE SCHEDULE</span><h3>Schedule a patient reminder</h3></div>
          <button type="button" onClick={() => setOpen(false)}>×</button>
        </header>
        <label>
          Patient
          <select value={patientId} onChange={(event) => { setPatientId(event.target.value); selectPrescription(""); }} required>
            <option value="">Select patient</option>
            {patients.map((patient) => (
              <option value={patient.id} key={patient.id}>{patient.full_name}{patient.phone ? ` · ${patient.phone}` : ""}</option>
            ))}
          </select>
        </label>
        <label>
          Reminder type
          <select name="reminderType" defaultValue="medication">
            <option value="medication">Medication</option>
            <option value="follow_up">Follow-up / revisit</option>
            <option value="test">Test / investigation</option>
            <option value="care">General care</option>
          </select>
        </label>
        <label>
          Linked prescription
          <select value={prescriptionId} onChange={(event) => selectPrescription(event.target.value)}>
            <option value="">No linked prescription</option>
            {patientPrescriptions.map((item) => (
              <option key={item.id} value={item.id}>{item.prescription_number}</option>
            ))}
          </select>
        </label>
        <label>
          Linked medicine
          <select value={medicineId} onChange={(event) => setMedicineId(event.target.value)}>
            <option value="">No linked medicine</option>
            {selectedPrescription?.items.map((item) => (
              <option key={item.id} value={item.id}>{item.medicine_name}{item.dosage ? ` · ${item.dosage}` : ""}</option>
            ))}
          </select>
        </label>
        <label className="wide">
          Reminder title
          <input name="title" placeholder="e.g. Take Metformin after breakfast" required />
        </label>
        <label className="wide">
          Instructions
          <textarea name="instructions" rows={3} placeholder="Doctor-approved instruction shown in the reminder" />
        </label>
        <fieldset className="wide">
          <legend>Schedule</legend>
          <button type="button" className={kind === "one_time" ? "active" : ""} onClick={() => setKind("one_time")}>One time</button>
          <button type="button" className={kind === "daily" ? "active" : ""} onClick={() => setKind("daily")}>Every day</button>
        </fieldset>
        {kind === "one_time" ? (
          <label className="wide">Date and time<input name="scheduledFor" type="datetime-local" required /></label>
        ) : (
          <>
            <label>Start date<input name="startsOn" type="date" required /></label>
            <label>Reminder time<input name="timeOfDay" type="time" required /></label>
            <label className="wide">End date<input name="endsOn" type="date" /></label>
          </>
        )}
        <label className="wide">
          Channel
          <select name="channel" defaultValue="whatsapp">
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="manual">Staff task only</option>
          </select>
        </label>
        {patientId && !patientMap.get(patientId)?.care_communications_consent && (
          <p className="care-consent-warning wide">This patient has not granted care-communication consent. The schedule can be saved, but due runs will be skipped until consent is recorded.</p>
        )}
        {error && <p className="care-error wide">{error}</p>}
        <button className="care-submit wide" disabled={saving || !patientId}>{saving ? "Scheduling…" : "Create care schedule"}</button>
      </form>
    </div>
  );
}
