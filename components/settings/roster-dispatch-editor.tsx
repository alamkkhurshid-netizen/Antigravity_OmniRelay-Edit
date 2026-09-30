"use client";

interface RosterDispatchEditorProps {
  category: string;
  dispatchEnabled: boolean;
  setDispatchEnabled: (val: boolean) => void;
  dispatchTime: string;
  setDispatchTime: (val: string) => void;
  dispatchClinicEmail: string;
  setDispatchClinicEmail: (val: string) => void;
  email: string;
  sendToClinic: boolean;
  setSendToClinic: (val: boolean) => void;
  sendToDoctors: boolean;
  setSendToDoctors: (val: boolean) => void;
  dispatchingTest: boolean;
  testDispatch: () => void;
  dispatchNotice: string;
}

export function RosterDispatchEditor({
  category, dispatchEnabled, setDispatchEnabled, dispatchTime, setDispatchTime,
  dispatchClinicEmail, setDispatchClinicEmail, email, sendToClinic, setSendToClinic,
  sendToDoctors, setSendToDoctors, dispatchingTest, testDispatch, dispatchNotice
}: RosterDispatchEditorProps) {
  if (category !== "Healthcare") return null;

  return (
    <section className="foundation-section" id="roster-dispatch-settings">
      <header>
        <div>
          <span className="app-eyebrow">AUTOMATED OPERATIONS</span>
          <h2>Daily Patient Booking Roster & Email Dispatch</h2>
        </div>
        <span className="section-status" style={{ background: dispatchEnabled ? "#ecfdf5" : "#f1f5f9", color: dispatchEnabled ? "#059669" : "#64748b" }}>
          {dispatchEnabled ? "Automated Dispatch Active" : "Dispatch Disabled"}
        </span>
      </header>
      <p className="required-note">Automatically email the daily booking sheet to clinic reception and personal schedules to each doctor before closing.</p>
      <div className="editor-card">
        <div className="form-grid">
          <label className="wide inline-flex items-center gap-2 font-bold cursor-pointer">
            <input type="checkbox" checked={dispatchEnabled} onChange={(e) => setDispatchEnabled(e.target.checked)} />
            Enable automated daily booking email dispatch
          </label>
          <label>
            Preferred dispatch time (IST)
            <select value={dispatchTime} onChange={(e) => setDispatchTime(e.target.value)} disabled={!dispatchEnabled}>
              <option value="17:00">05:00 PM (Early Evening)</option>
              <option value="18:00">06:00 PM</option>
              <option value="19:00">07:00 PM (Clinic Closing)</option>
              <option value="20:00">08:00 PM (Standard EOD)</option>
              <option value="21:00">09:00 PM (Night Summary)</option>
              <option value="22:00">10:00 PM</option>
            </select>
            <small className="field-help">Cron checks every hour and triggers organizations matching this window.</small>
          </label>
          <label>
            Clinic recipient email
            <input
              type="email"
              value={dispatchClinicEmail}
              onChange={(e) => setDispatchClinicEmail(e.target.value)}
              placeholder={email || "reception@clinic.com"}
              disabled={!dispatchEnabled}
            />
            <small className="field-help">Leave empty to use primary clinic email ({email || "not configured"}).</small>
          </label>
          <label className="wide inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={sendToClinic}
              onChange={(e) => setSendToClinic(e.target.checked)}
              disabled={!dispatchEnabled}
            />
            Send master summary & attached spreadsheet to Clinic Email
          </label>
          <label className="wide inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={sendToDoctors}
              onChange={(e) => setSendToDoctors(e.target.checked)}
              disabled={!dispatchEnabled}
            />
            Send doctor-specific personal schedules to each doctor&apos;s registered email
          </label>
        </div>
        <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #e2e8f0", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="secondary-button"
            disabled={dispatchingTest}
            onClick={testDispatch}
          >
            {dispatchingTest ? "Testing Dispatch..." : "✉️ Send Test Dispatch Now"}
          </button>
          <small style={{ color: "#64748b" }}>Simulates the evening dispatch immediately for today&apos;s roster without waiting for cron.</small>
        </div>
        {dispatchNotice && <p className="form-message" style={{ marginTop: "12px" }} role="status">{dispatchNotice}</p>}
      </div>
    </section>
  );
}
