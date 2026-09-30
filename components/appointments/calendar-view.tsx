"use client";

import { Appointment, Location, Resource } from "@/app/app/appointments/types";
import { dateKey, timeLabel } from "@/app/app/appointments/utils";

interface CalendarViewProps {
  view: "week" | "agenda";
  setView: (val: "week" | "agenda") => void;
  weekStart: string;
  setWeekStart: (val: string) => void;
  today: string;
  addDays: (date: string, amount: number) => string;
  filterLocation: string;
  setFilterLocation: (val: string) => void;
  filterResource: string;
  setFilterResource: (val: string) => void;
  filterStatus: string;
  setFilterStatus: (val: string) => void;
  locations: Location[];
  resources: Resource[];
  appointments: Appointment[];
  filteredAppointments: Appointment[];
  weekDates: string[];
  weekAppointments: Appointment[];
  setActiveAppointment: (app: Appointment | null) => void;
  setRescheduleDate: (date: string) => void;
  setRescheduleSlot: (slot: string) => void;
  setRescheduling: (val: boolean) => void;
}

export function CalendarView({
  view, setView, weekStart, setWeekStart, today, addDays,
  filterLocation, setFilterLocation,
  filterResource, setFilterResource,
  filterStatus, setFilterStatus,
  locations, resources, appointments,
  filteredAppointments, weekDates, weekAppointments,
  setActiveAppointment, setRescheduleDate, setRescheduleSlot, setRescheduling
}: CalendarViewProps) {
  return (
    <section className="operations-calendar">
      <header>
        <div>
          <span className="app-eyebrow">SCHEDULE</span>
          <h3>{view === "week" ? "Week calendar" : "Appointment agenda"}</h3>
        </div>
        <div className="calendar-controls">
          <div>
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">←</button>
            <button onClick={() => setWeekStart(today)}>Today</button>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">→</button>
          </div>
          <div>
            <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Week</button>
            <button className={view === "agenda" ? "active" : ""} onClick={() => setView("agenda")}>Agenda</button>
          </div>
        </div>
      </header>
      <div className="calendar-filters">
        <label>
          Chamber
          <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}>
            <option value="">All chambers</option>
            {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          Provider
          <select value={filterResource} onChange={(e) => setFilterResource(e.target.value)}>
            <option value="">All providers</option>
            {resources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="active">Active work</option>
            <option value="all">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="arrived">Arrived</option>
            <option value="in_consultation">In consultation</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No-show</option>
            <option value="rescheduling_required">Needs rescheduling</option>
          </select>
        </label>
        <span>{filteredAppointments.length} matching appointments</span>
      </div>
      {view === "week" ? (
        <div className="week-calendar">
          {weekDates.map((key) => {
            const dayItems = weekAppointments.filter((item) => dateKey(new Date(item.starts_at)) === key);
            return (
              <section className={key === today ? "calendar-day today" : "calendar-day"} key={key}>
                <header>
                  <span>{new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(new Date(`${key}T00:00:00+05:30`))}</span>
                  <b>{new Date(`${key}T00:00:00+05:30`).getDate()}</b>
                </header>
                <div>
                  {dayItems.map((item) => (
                    <button className={`calendar-event status-${item.status}`} onClick={() => { setActiveAppointment(item); setRescheduleDate(dateKey(new Date(item.starts_at))); setRescheduleSlot(""); setRescheduling(false); }} key={item.id}>
                      <time>{timeLabel(new Date(item.starts_at))}</time>
                      <b>{item.customer_name}</b>
                      <span>{item.service?.name}</span>
                      <small>{item.location?.name}</small>
                    </button>
                  ))}
                  {dayItems.length === 0 && <span className="calendar-free">No bookings</span>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="appointment-list">
          {appointments.length === 0 ? (
            <div className="appointment-empty">
              <b>No appointments yet</b>
              <span>Create the first manual booking to verify the calendar flow.</span>
            </div>
          ) : (
            appointments.map((item) => (
              <article className={`appointment-item status-${item.status}`} key={item.id} onClick={() => { setActiveAppointment(item); setRescheduleDate(dateKey(new Date(item.starts_at))); setRescheduling(false); }}>
                <div className="appointment-time">
                  <b>{new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(item.starts_at))}</b>
                  <span>{timeLabel(new Date(item.starts_at))}</span>
                </div>
                <div className="appointment-customer">
                  <b>{item.customer_name}</b>
                  <span>{item.service?.name ?? "Service"} · {item.location?.name ?? "Location"} · {item.resource?.name ?? "Provider"}</span>
                  <small>{item.customer_phone || item.customer_email || "No contact supplied"}</small>
                </div>
                <span className="appointment-status">{item.status}</span>
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
