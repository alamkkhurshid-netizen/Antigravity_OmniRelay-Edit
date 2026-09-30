"use client";

import { Resource, DaySchedule } from "@/app/app/appointments/types";
import { dayNames } from "@/app/app/appointments/utils";

interface AvailabilityEditorProps {
  resources: Resource[];
  availabilityResource: string;
  setAvailabilityResource: (val: string) => void;
  loadSchedule: (nextResource: string) => void;
  schedule: DaySchedule[];
  setSchedule: React.Dispatch<React.SetStateAction<DaySchedule[]>>;
  saveAvailability: () => void;
  busy: boolean;
  message: string;
}

export function AvailabilityEditor({
  resources,
  availabilityResource,
  loadSchedule,
  schedule,
  setSchedule,
  saveAvailability,
  busy,
  message,
}: AvailabilityEditorProps) {
  return (
    <section className="availability-editor">
      <header>
        <div>
          <span className="app-eyebrow">STAFF HOURS</span>
          <h3>Weekly availability</h3>
          <p>These working windows power dashboard and future WhatsApp bookings.</p>
        </div>
        <label>
          Provider
          <select value={availabilityResource} onChange={(e)=>loadSchedule(e.target.value)}>
            {resources.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
      </header>
      <div className="availability-days">
        {schedule.map((item, index) => (
          <div className={item.active ? "availability-day active" : "availability-day"} key={item.weekday}>
            <label className="day-toggle">
              <input type="checkbox" checked={item.active} onChange={(e) => setSchedule((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, active: e.target.checked } : row))} />
              <span></span>
              <b>{dayNames[item.weekday]}</b>
            </label>
            {item.active ? (
              <div className="day-hours">
                <input aria-label={`${dayNames[item.weekday]} start`} type="time" value={item.start_time} onChange={(e) => setSchedule((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, start_time: e.target.value } : row))} />
                <span>to</span>
                <input aria-label={`${dayNames[item.weekday]} end`} type="time" value={item.end_time} onChange={(e) => setSchedule((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, end_time: e.target.value } : row))} />
                <select aria-label={`${dayNames[item.weekday]} interval`} value={item.slot_interval_minutes} onChange={(e) => setSchedule((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, slot_interval_minutes: Number(e.target.value) } : row))}>
                  <option value={15}>15 min slots</option>
                  <option value={30}>30 min slots</option>
                  <option value={60}>60 min slots</option>
                </select>
              </div>
            ) : (
              <span className="closed-label">Closed</span>
            )}
          </div>
        ))}
      </div>
      <div className="availability-save">
        <span>Existing appointments remain unchanged.</span>
        <button className="primary-button" type="button" onClick={saveAvailability} disabled={busy}>
          {busy ? "Saving…" : "Save availability"}
        </button>
      </div>
      {message && <p className="form-message" role="status">{message}</p>}
    </section>
  );
}
