import { Appointment } from "@/app/app/appointments/types";

export function FollowUpPlanner({
  appointments,
  nowIso,
  today,
  followUpAppointmentId,
  setFollowUpAppointmentId,
  followUpDate,
  setFollowUpDate,
  followUpNote,
  setFollowUpNote,
  busy,
  saveFollowUp,
  startFollowUpBooking,
  addDays,
}: {
  appointments: Appointment[];
  nowIso: string;
  today: string;
  followUpAppointmentId: string;
  setFollowUpAppointmentId: (id: string) => void;
  followUpDate: string;
  setFollowUpDate: (date: string) => void;
  followUpNote: string;
  setFollowUpNote: (note: string) => void;
  busy: boolean;
  saveFollowUp: () => Promise<void>;
  startFollowUpBooking: (appointment: Appointment) => void;
  addDays: (key: string, amount: number) => string;
}) {
  return (
    <section className="follow-up-planner">
      <header>
        <div>
          <span className="app-eyebrow">CONTINUITY OF CARE</span>
          <h3>Schedule a revisit reminder</h3>
          <p>
            Choose a past or current patient visit, set the revisit date, and
            OmniRelay queues the reminder using the patient’s consented channel.
          </p>
        </div>
        {appointments.filter(
          (item) =>
            item.follow_up_at &&
            new Date(item.follow_up_at) > new Date(nowIso),
        ).length > 0 && (
          <span>
            {
              appointments.filter(
                (item) =>
                  item.follow_up_at &&
                  new Date(item.follow_up_at) > new Date(nowIso),
              ).length
            }{" "}
            upcoming
          </span>
        )}
      </header>
      <div>
        <label>
          Patient visit
          <select
            value={followUpAppointmentId}
            onChange={(e) => setFollowUpAppointmentId(e.target.value)}
          >
            <option value="">Select appointment</option>
            {appointments
              .filter((item) => ["confirmed", "completed"].includes(item.status))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.customer_name} ·{" "}
                  {new Intl.DateTimeFormat("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(item.starts_at))}
                </option>
              ))}
          </select>
        </label>
        <label>
          Revisit date
          <input
            type="date"
            min={addDays(today, 1)}
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
        </label>
        <label>
          Reminder note
          <input
            value={followUpNote}
            maxLength={240}
            onChange={(e) => setFollowUpNote(e.target.value)}
            placeholder="Example: Diabetes follow-up with reports"
          />
        </label>
        <button
          onClick={saveFollowUp}
          disabled={busy || !followUpAppointmentId || !followUpDate}
        >
          {busy ? "Scheduling…" : "Schedule revisit reminder"}
        </button>
        {followUpAppointmentId && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const appointment = appointments.find(
                (item) => item.id === followUpAppointmentId,
              );
              if (appointment) startFollowUpBooking(appointment);
            }}
          >
            Book with original doctor
          </button>
        )}
      </div>
    </section>
  );
}
