import React from "react";
import Link from "next/link";
import { RosterRow } from "@/app/app/clinic-operations/types";

export function LiveRoster({
  visibleRoster,
  loading,
  updated,
  queueBusy,
  consentRow,
  consentChecked,
  queueMessage,
  dayInfo,
  sendQueue,
  setQueue,
  setConsentRow,
  setConsentChecked,
}: {
  visibleRoster: RosterRow[];
  loading: boolean;
  updated: string;
  queueBusy: string;
  consentRow: RosterRow | null;
  consentChecked: boolean;
  queueMessage: string;
  dayInfo: { weekdayName: string };
  sendQueue: (row: RosterRow) => void;
  setQueue: (row: RosterRow, enabled: boolean, acknowledged?: boolean) => void;
  setConsentRow: (row: RosterRow | null) => void;
  setConsentChecked: (checked: boolean) => void;
}) {
  return (
    <section className="live-roster">
      <header>
        <div>
          <span className="app-eyebrow">TODAY’S VISITING ROSTER</span>
          <h3>Department and doctor booking density</h3>
        </div>
        <small>
          {loading
            ? "Refreshing…"
            : updated
              ? `Updated ${new Intl.DateTimeFormat("en-IN", {
                  hour: "numeric",
                  minute: "2-digit",
                }).format(new Date(updated))}`
              : ""}
        </small>
      </header>
      {!visibleRoster.length ? (
        <div className="roster-empty">
          No visiting-doctor sessions match this date and department.
        </div>
      ) : (
        <div className="roster-grid">
          {visibleRoster.map((row) => (
            <article key={row.id}>
              <header>
                <div>
                  <small>{row.department}</small>
                  <b>{row.doctor}</b>
                  <span>
                    {row.specialization} · {row.chamber}
                  </span>
                </div>
                <time>
                  {row.startTime}–{row.endTime}
                </time>
              </header>
              {row.exceptions.length > 0 && (
                <p className="roster-exception">
                  {row.exceptions[0].type}: {row.exceptions[0].reason}
                </p>
              )}
              <div className="density">
                <i
                  style={{
                    width: `${
                      row.capacity
                        ? Math.min(100, (row.booked / row.capacity) * 100)
                        : 0
                    }%`,
                  }}
                />
                <span>{row.booked} booked</span>
                <span>{row.empty} empty</span>
              </div>
              <dl>
                <div>
                  <dt>Arrived</dt>
                  <dd>{row.arrived}</dd>
                </div>
                <div>
                  <dt>In consultation</dt>
                  <dd>{row.inConsultation}</dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>{row.completed}</dd>
                </div>
                <div>
                  <dt>No-show</dt>
                  <dd>{row.noShow}</dd>
                </div>
              </dl>
              <div className="doctor-queue-control">
                <div>
                  <b>WhatsApp queue</b>
                  <span>
                    {!row.doctorPhone
                      ? "Doctor number missing"
                      : row.dispatch
                        ? `Dispatch: ${row.dispatch.status}`
                        : row.queueEnabled
                          ? "Automatic · 1 hour before shift"
                          : "Consent not recorded"}
                  </span>
                  {row.dispatch?.failure_reason && (
                    <small>{row.dispatch.failure_reason}</small>
                  )}
                </div>
                <nav>
                  {!row.doctorPhone ? (
                    <Link className="queue-action-link" href="/app/settings">
                      Add doctor number
                    </Link>
                  ) : row.dispatch?.status === "failed" ? (
                    <Link className="queue-action-link" href="/app/operations">
                      Review delivery failure
                    </Link>
                  ) : row.queueEnabled ? (
                    <>
                      <button
                        type="button"
                        disabled={queueBusy !== "" || Boolean(row.dispatch)}
                        onClick={() => sendQueue(row)}
                      >
                        {row.dispatch ? "Already scheduled" : "Send queue now"}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={queueBusy !== ""}
                        onClick={() => setQueue(row, false)}
                      >
                        Disable
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={queueBusy !== "" || !row.doctorPhone}
                      onClick={() => {
                        setConsentRow(row);
                        setConsentChecked(false);
                      }}
                    >
                      Review consent
                    </button>
                  )}
                </nav>
              </div>
            </article>
          ))}
        </div>
      )}
      {consentRow && (
        <div
          className="queue-consent-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setConsentRow(null);
              setConsentChecked(false);
            }
          }}
        >
          <aside
            className="queue-consent-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="queue-consent-title"
          >
            <b id="queue-consent-title">
              Confirm consent for {consentRow.doctor}
            </b>
            <span>
              The doctor agreed to receive operational shift and booking-count
              notifications on {consentRow.doctorPhone}. Messages exclude
              patient names and clinical information. Consent can be withdrawn
              at any time.
            </span>
            <label>
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(event) => setConsentChecked(event.target.checked)}
              />{" "}
              I confirm the doctor explicitly agreed to this WhatsApp use.
            </label>
            <nav>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setConsentRow(null);
                  setConsentChecked(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!consentChecked || queueBusy !== ""}
                onClick={() => setQueue(consentRow, true, true)}
              >
                Record evidence & enable
              </button>
            </nav>
          </aside>
        </div>
      )}
      {queueMessage && (
        <p className="form-message" role="status">
          {queueMessage}
        </p>
      )}
      <aside className="queue-consent-notice">
        <b>Doctor WhatsApp consent notice v1</b>
        <span>
          Every enablement and withdrawal is recorded as immutable evidence.
          Messages exclude patient names and clinical information.
        </span>
      </aside>
    </section>
  );
}
