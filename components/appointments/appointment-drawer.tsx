"use client";

import { Appointment, Resource } from "@/app/app/appointments/types";
import { dateKey, longDate, timeLabel, activeStatuses, addDays } from "@/app/app/appointments/utils";

interface AppointmentDrawerProps {
  activeAppointment: Appointment;
  setActiveAppointment: (val: Appointment | null) => void;
  updateStatus: (id: string, status: string) => void;
  cancelAppointment: (id: string) => void;
  rescheduling: boolean;
  setRescheduling: (val: boolean) => void;
  substituteOpen: boolean;
  setSubstituteOpen: (val: boolean) => void;
  substituteResources: Resource[];
  setSubstituteResourceId: (val: string) => void;
  setSubstituteDate: (val: string) => void;
  setSubstituteSlot: (val: string) => void;
  today: string;
  rescheduleDate: string;
  setRescheduleDate: (val: string) => void;
  rescheduleSlot: string;
  setRescheduleSlot: (val: string) => void;
  rescheduleSlots: Array<{ iso: string; label: string; period: string }>;
  rescheduleAppointment: () => void;
  substituteResourceId: string;
  substituteDate: string;
  substituteSlot: string;
  substituteSlots: Array<{ iso: string; label: string; period: string }>;
  assignSubstitute: () => void;
  busy: boolean;
  message: string;
}

export function AppointmentDrawer({
  activeAppointment, setActiveAppointment, updateStatus, cancelAppointment,
  rescheduling, setRescheduling,
  substituteOpen, setSubstituteOpen, substituteResources,
  setSubstituteResourceId, setSubstituteDate, setSubstituteSlot,
  today,
  rescheduleDate, setRescheduleDate, rescheduleSlot, setRescheduleSlot, rescheduleSlots, rescheduleAppointment,
  substituteResourceId, substituteDate, substituteSlot, substituteSlots, assignSubstitute,
  busy, message
}: AppointmentDrawerProps) {
  return (
    <div className="appointment-drawer-backdrop" onClick={() => setActiveAppointment(null)}>
      <aside className="appointment-drawer" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <span className="app-eyebrow">APPOINTMENT</span>
            <h3>{activeAppointment.customer_name}</h3>
          </div>
          <button onClick={() => setActiveAppointment(null)} aria-label="Close details">×</button>
        </header>
        <div className="appointment-detail-time">
          <b>{longDate(dateKey(new Date(activeAppointment.starts_at)))}</b>
          <span>{timeLabel(new Date(activeAppointment.starts_at))}–{timeLabel(new Date(activeAppointment.ends_at))}</span>
        </div>
        <dl>
          <div><dt>Status</dt><dd>{activeAppointment.status.replaceAll("_", " ")}</dd></div>
          <div><dt>Service</dt><dd>{activeAppointment.service?.name}</dd></div>
          <div><dt>Provider</dt><dd>{activeAppointment.resource?.name}</dd></div>
          <div><dt>Location</dt><dd>{activeAppointment.location?.name}</dd></div>
          <div><dt>Contact</dt><dd>{activeAppointment.customer_phone || activeAppointment.customer_email || "Not supplied"}</dd></div>
          <div><dt>Source</dt><dd>{activeAppointment.source}</dd></div>
          {activeAppointment.notes && <div><dt>Notes</dt><dd>{activeAppointment.notes}</dd></div>}
        </dl>
        {(activeStatuses.includes(activeAppointment.status) || activeAppointment.status === "rescheduling_required") && (
          <>
            <div className="lifecycle-actions">
              {activeAppointment.status === "pending" && <button onClick={() => updateStatus(activeAppointment.id, "confirmed")} disabled={busy}>Confirm</button>}
              {activeAppointment.status === "confirmed" && <button onClick={() => updateStatus(activeAppointment.id, "arrived")} disabled={busy}>Mark arrived</button>}
              {activeAppointment.status === "arrived" && <button onClick={() => updateStatus(activeAppointment.id, "in_consultation")} disabled={busy}>Start consultation</button>}
              {["confirmed", "arrived", "in_consultation"].includes(activeAppointment.status) && <button onClick={() => updateStatus(activeAppointment.id, "completed")} disabled={busy}>Complete & document</button>}
              {["confirmed"].includes(activeAppointment.status) && <button onClick={() => updateStatus(activeAppointment.id, "no_show")} disabled={busy}>Mark no-show</button>}
            </div>
            <div className="drawer-actions">
              <button className="secondary-button" onClick={() => setRescheduling(!rescheduling)}>{rescheduling ? "Keep current time" : "Reschedule"}</button>
              {substituteResources.length > 0 && <button className="secondary-button" onClick={() => { setSubstituteOpen(!substituteOpen); setSubstituteResourceId(substituteResources[0]?.id ?? ""); setSubstituteDate(dateKey(new Date(activeAppointment.starts_at))); setSubstituteSlot("") }}>Offer substitute doctor</button>}
              <button className="danger-button" onClick={() => cancelAppointment(activeAppointment.id)} disabled={busy}>Cancel appointment</button>
            </div>
          </>
        )}
        {rescheduling && (
          <section className="reschedule-panel">
            <b>Choose a new time</b>
            <div className="reschedule-dates">
              {Array.from({ length: 14 }, (_, index) => addDays(today, index)).map((key) => (
                <button className={rescheduleDate === key ? "selected" : ""} onClick={() => { setRescheduleDate(key); setRescheduleSlot(""); }} key={key}>
                  <span>{new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(new Date(`${key}T00:00:00+05:30`))}</span>
                  <b>{new Date(`${key}T00:00:00+05:30`).getDate()}</b>
                </button>
              ))}
            </div>
            <div className="reschedule-slots">
              {rescheduleSlots.length ? rescheduleSlots.map((slot) => (
                <button className={rescheduleSlot === slot.iso ? "selected" : ""} onClick={() => setRescheduleSlot(slot.iso)} key={slot.iso}>{slot.label}</button>
              )) : <span>No available times on this date.</span>}
            </div>
            <button className="primary-button" onClick={rescheduleAppointment} disabled={!rescheduleSlot || busy}>{busy ? "Checking…" : "Confirm new time"}</button>
          </section>
        )}
        {substituteOpen && (
          <section className="reschedule-panel">
            <b>Offer a suitable colleague</b>
            <p>Only doctors sharing this booking&apos;s department are shown. OmniRelay rechecks chamber, service, schedule and slot availability before changing the appointment.</p>
            <select value={substituteResourceId} onChange={event => { setSubstituteResourceId(event.target.value); setSubstituteSlot("") }}>
              {substituteResources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <div className="reschedule-dates">
              {Array.from({ length: 14 }, (_, index) => addDays(today, index)).map((key) => (
                <button className={substituteDate === key ? "selected" : ""} onClick={() => { setSubstituteDate(key); setSubstituteSlot(""); }} key={key}>
                  <span>{new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(new Date(`${key}T00:00:00+05:30`))}</span>
                  <b>{new Date(`${key}T00:00:00+05:30`).getDate()}</b>
                </button>
              ))}
            </div>
            <div className="reschedule-slots">
              {substituteSlots.length ? substituteSlots.map((slot) => (
                <button className={substituteSlot === slot.iso ? "selected" : ""} onClick={() => setSubstituteSlot(slot.iso)} key={slot.iso}>{slot.label}</button>
              )) : <span>No suitable slots on this date.</span>}
            </div>
            <button className="primary-button" onClick={assignSubstitute} disabled={!substituteSlot || busy}>{busy ? "Checking…" : "Confirm substitute doctor"}</button>
          </section>
        )}
        {message && <p className="form-message" role="status">{message}</p>}
      </aside>
    </div>
  );
}
