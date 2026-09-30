"use client";

import { Appointment } from "@/app/app/appointments/types";
import { addDays } from "@/app/app/appointments/utils";
import * as Dialog from "@radix-ui/react-dialog";

interface ClinicalModalProps {
  activeAppointment: Appointment;
  setDocumenting: (val: boolean) => void;
  encounterType: string;
  setEncounterType: (val: string) => void;
  diagnosis: string;
  setDiagnosis: (val: string) => void;
  clinicalNote: string;
  setClinicalNote: (val: string) => void;
  treatmentPlan: string;
  setTreatmentPlan: (val: string) => void;
  visitFollowUpDate: string;
  setVisitFollowUpDate: (val: string) => void;
  today: string;
  completeConsultation: () => void;
  busy: boolean;
  message: string;
}

export function ClinicalModal({
  activeAppointment, setDocumenting,
  encounterType, setEncounterType,
  diagnosis, setDiagnosis,
  clinicalNote, setClinicalNote,
  treatmentPlan, setTreatmentPlan,
  visitFollowUpDate, setVisitFollowUpDate,
  today, completeConsultation,
  busy, message
}: ClinicalModalProps) {
  if (!activeAppointment) return null;

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && setDocumenting(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="clinical-modal-backdrop" />
        <Dialog.Content asChild>
          <section className="clinical-completion">
            <header>
              <div>
                <Dialog.Title className="app-eyebrow">CLINICAL RECORD</Dialog.Title>
                <Dialog.Description asChild><h4>Complete consultation</h4></Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button aria-label="Close clinical record">×</button>
              </Dialog.Close>
            </header>
        <p>This links the patient, saves one visit, closes the appointment and prepares any follow-up action in one transaction.</p>
        <label>Visit type
          <select value={encounterType} onChange={(e) => setEncounterType(e.target.value)}>
            <option value="consultation">Consultation</option>
            <option value="follow_up">Follow-up</option>
            <option value="procedure">Procedure</option>
            <option value="vaccination">Vaccination</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>Diagnosis / concern
          <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Optional working diagnosis or concern" />
        </label>
        <label>Clinical note <em>required</em>
          <textarea value={clinicalNote} onChange={(e) => setClinicalNote(e.target.value)} placeholder="Document observations, assessment and advice" />
        </label>
        <label>Treatment / follow-up instructions
          <textarea value={treatmentPlan} onChange={(e) => setTreatmentPlan(e.target.value)} placeholder="Plan, tests, referral or patient-safe follow-up instructions" />
        </label>
        <label>Follow-up date<input type="date" min={addDays(today, 1)} value={visitFollowUpDate} onChange={(e) => setVisitFollowUpDate(e.target.value)} /></label>
        <div className="follow-up-picks">
          {[5, 10, 15, 30].map((days) => (
            <button type="button" key={days} onClick={() => setVisitFollowUpDate(addDays(today, days))}>{days} days</button>
          ))}
        </div>
        <button className="primary-button" onClick={completeConsultation} disabled={busy || !clinicalNote.trim()}>
          {busy ? "Saving visit…" : "Save visit & complete"}
        </button>
        {message && <p className="form-message" role="status">{message}</p>}
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
