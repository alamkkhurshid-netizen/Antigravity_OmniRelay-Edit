import React from "react";
import { RosterRow, OpsAlert } from "@/app/app/clinic-operations/types";

export function RosterMetrics({
  dayInfo,
  visibleRoster,
  totals,
  alerts,
}: {
  dayInfo: { weekdayName: string; formatted: string; isToday: boolean };
  visibleRoster: RosterRow[];
  totals: {
    capacity: number;
    booked: number;
    empty: number;
    arrived: number;
    completed: number;
  };
  alerts: OpsAlert[];
}) {
  return (
    <>
      <section className="roster-metrics">
        <article>
          <span>Doctors visiting ({dayInfo.weekdayName.slice(0, 3)})</span>
          <b>{new Set(visibleRoster.map((row) => row.doctor)).size}</b>
          <small>
            {visibleRoster.length} scheduled session
            {visibleRoster.length === 1 ? "" : "s"}
          </small>
        </article>
        <article>
          <span>Booked</span>
          <b>
            {totals.booked}/{totals.capacity}
          </b>
          <small>Appointments / capacity</small>
        </article>
        <article>
          <span>Empty slots</span>
          <b>{totals.empty}</b>
          <small>Available capacity</small>
        </article>
        <article>
          <span>Patient flow</span>
          <b>{totals.arrived + totals.completed}</b>
          <small>
            {totals.arrived} arrived · {totals.completed} completed
          </small>
        </article>
      </section>
      {alerts.length > 0 && (
        <section className="clinic-ops-alerts">
          <header>
            <div>
              <span className="app-eyebrow">ACTION REQUIRED</span>
              <h3>Roster and queue exceptions</h3>
            </div>
            <b>{alerts.length}</b>
          </header>
          <div>
            {alerts.map((alert) => (
              <article className={alert.severity} key={alert.key}>
                <i>!</i>
                <div>
                  <b>{alert.title}</b>
                  <span>{alert.detail}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
