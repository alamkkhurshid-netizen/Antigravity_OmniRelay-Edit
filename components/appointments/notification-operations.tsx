import { Reminder } from "@/app/app/appointments/types";

export function NotificationOperations({
  reminders,
  setNotificationOpen,
}: {
  reminders: Reminder[];
  setNotificationOpen: (open: boolean) => void;
}) {
  return (
    <section className="notification-operations">
      <header>
        <div>
          <span className="app-eyebrow">AUTOMATED DELIVERY</span>
          <h3>Patient communications</h3>
          <p>
            The production worker checks this queue every minute. Approved Meta
            templates are required before WhatsApp delivery begins.
          </p>
        </div>
        <button onClick={() => setNotificationOpen(false)}>Close</button>
      </header>
      <div className="notification-table">
        <div className="notification-head">
          <span>Patient</span>
          <span>Message</span>
          <span>Channel</span>
          <span>Scheduled</span>
          <span>Status</span>
        </div>
        {reminders.length ? (
          reminders.map((item) => {
            const delivery = item.read_at
              ? "read"
              : item.delivered_at
                ? "delivered"
                : item.sent_at
                  ? "sent"
                  : item.status;
            return (
              <article key={item.id} title={item.failure_reason ?? undefined}>
                <b>{item.appointment?.customer_name ?? "Patient"}</b>
                <span>
                  {item.event_type.replaceAll("_", " ")}
                  {item.failure_reason && (
                    <small> · {item.failure_reason}</small>
                  )}
                </span>
                <i>{item.channel}</i>
                <time>
                  {new Intl.DateTimeFormat("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(item.scheduled_for))}
                </time>
                <em className={`queue-${delivery}`}>
                  {delivery}
                  {item.next_attempt_at && item.status === "scheduled"
                    ? " · retry queued"
                    : ""}
                </em>
              </article>
            );
          })
        ) : (
          <p>No communication events yet.</p>
        )}
      </div>
    </section>
  );
}
