"use client";

import { Location, Resource, Appointment } from "@/app/app/appointments/types";

interface DisruptionPanelProps {
  resources: Resource[];
  locations: Location[];
  today: string;
  disruptionResource: string;
  setDisruptionResource: (val: string) => void;
  disruptionLocation: string;
  setDisruptionLocation: (val: string) => void;
  disruptionDate: string;
  setDisruptionDate: (val: string) => void;
  disruptionType: string;
  setDisruptionType: (val: string) => void;
  disruptionStart: string;
  setDisruptionStart: (val: string) => void;
  disruptionEnd: string;
  setDisruptionEnd: (val: string) => void;
  disruptionReason: string;
  setDisruptionReason: (val: string) => void;
  disruptionAffected: Appointment[];
  createDisruption: () => void;
  disruptionResult: { affected_appointments: number; notifications_queued: number } | null;
  busy: boolean;
  message: string;
}

export function DisruptionPanel({
  resources, locations, today,
  disruptionResource, setDisruptionResource,
  disruptionLocation, setDisruptionLocation,
  disruptionDate, setDisruptionDate,
  disruptionType, setDisruptionType,
  disruptionStart, setDisruptionStart,
  disruptionEnd, setDisruptionEnd,
  disruptionReason, setDisruptionReason,
  disruptionAffected, createDisruption, disruptionResult,
  busy, message
}: DisruptionPanelProps) {
  return (
    <section className="disruption-panel">
      <header>
        <div>
          <span className="app-eyebrow">SCHEDULE EXCEPTION</span>
          <h3>Block time and protect every affected patient</h3>
          <p>New bookings stop immediately. Existing appointments move to rescheduling required and a notification is queued.</p>
        </div>
        <span className="disruption-impact">{disruptionAffected.length} affected</span>
      </header>
      <div className="form-grid">
        <label>
          Provider
          <select value={disruptionResource} onChange={(e) => setDisruptionResource(e.target.value)}>
            <option value="">All providers</option>
            {resources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          Chamber
          <select value={disruptionLocation} onChange={(e) => setDisruptionLocation(e.target.value)}>
            <option value="">All chambers</option>
            {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Date<input type="date" min={today} value={disruptionDate} onChange={(e) => setDisruptionDate(e.target.value)} /></label>
        <label>Reason type
          <select value={disruptionType} onChange={(e) => setDisruptionType(e.target.value)}>
            <option value="emergency">Emergency</option>
            <option value="leave">Doctor leave</option>
            <option value="unavailable">Unavailable</option>
            <option value="holiday">Holiday</option>
          </select>
        </label>
        <label>Start time<input type="time" value={disruptionStart} onChange={(e) => setDisruptionStart(e.target.value)} /></label>
        <label>End time<input type="time" value={disruptionEnd} onChange={(e) => setDisruptionEnd(e.target.value)} /></label>
        <label className="wide">Patient-safe message
          <input value={disruptionReason} onChange={(e) => setDisruptionReason(e.target.value)} placeholder="Doctor unavailable due to an emergency. Please choose another time." />
        </label>
      </div>
      <div className="disruption-preview">
        <div>
          <b>{disruptionAffected.length} booked patients</b>
          <span>{disruptionAffected.length ? "They will receive a secure rescheduling instruction when WhatsApp/email delivery is connected." : "No existing patients overlap this period."}</span>
        </div>
        <button className="danger-button" onClick={createDisruption} disabled={busy || (!disruptionResource && !disruptionLocation)}>
          {busy ? "Applying safely…" : "Block schedule & queue messages"}
        </button>
      </div>
      {disruptionResult && <p className="success-message">Schedule blocked. {disruptionResult.affected_appointments} appointments updated and {disruptionResult.notifications_queued} notifications queued.</p>}
      {message && <p className="form-message" role="status">{message}</p>}
    </section>
  );
}
