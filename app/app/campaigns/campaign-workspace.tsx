"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCampaignCsv, generateSampleCampaignCsv, ParsedContact } from "@/lib/campaign-csv";

type P = { id: string; full_name: string; phone: string | null; health_concern: string | null; care_communications_consent: boolean; marketing_consent: boolean };
type C = { id: string; name: string; campaign_type: string; status: string; scheduled_for: string | null; eligible_count: number; sent_count: number; delivered_count: number; read_count: number; failed_count: number; skipped_count: number };
type T = { id: string; event_type: string; provider_template_name: string; language_code: string; status: string };
type L = { id: string; name: string };
type A = { patient_id: string | null; location_id: string | null; resource_id: string | null; starts_at: string; status: string };

const normalizeAddress = (value: string) => value.replace(/\D/g, "");
const doctorLabel = (name: string) => /^dr\b/i.test(name.trim()) ? name.trim() : `Dr ${name.trim()}`;

export function CampaignWorkspace({
  patients,
  campaigns,
  templates,
  locations,
  resources,
  appointments,
  optOuts,
}: {
  patients: P[];
  campaigns: C[];
  templates: T[];
  locations: L[];
  resources: L[];
  appointments: A[];
  optOuts: { address: string; scope: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [f, setF] = useState({
    name: "",
    campaignType: "care",
    templateId: "",
    segment: "all",
    keyword: "",
    locationId: "",
    resourceId: "",
    appointmentDate: "",
    action: "reschedule_required",
    scheduledFor: "",
    messageNote: "",
  });

  // CSV Audience Upload State
  const [csvContacts, setCsvContacts] = useState<ParsedContact[]>([]);
  const [csvMeta, setCsvMeta] = useState<{ invalidCount: number; duplicateCount: number; totalRows: number } | null>(null);
  const [csvFileName, setCsvFileName] = useState("");

  const event = { care: "care_campaign", marketing: "marketing_campaign", emergency: "emergency_notice" }[f.campaignType];
  const approved = templates.filter((t) => t.status === "approved" && t.event_type === event);
  const selectedDoctor = resources.find((resource) => resource.id === f.resourceId)?.name;
  const emergencyPreview = selectedDoctor
    ? `${doctorLabel(selectedDoctor)} is unavailable. ${f.messageNote.trim() || "Please contact the clinic for assistance."}`
    : "Select a doctor to preview the patient message.";

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = String(evt.target?.result || "");
      const res = parseCampaignCsv(text);
      setCsvContacts(res.validContacts);
      setCsvMeta({ invalidCount: res.invalidCount, duplicateCount: res.duplicateCount, totalRows: res.totalRows });
    };
    reader.readAsText(file);
  }

  function downloadSampleCsv() {
    const content = generateSampleCampaignCsv();
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample-patient-broadcast.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  // Calculate eligible count based on segment choice
  const eligibleCount = useMemo(() => {
    const scope = f.campaignType === "marketing" ? "marketing" : "care";
    const optedOutSet = new Set(
      optOuts.filter((o) => o.scope === "all" || o.scope === scope).map((o) => normalizeAddress(o.address))
    );

    if (f.segment === "csv") {
      return csvContacts.filter((c) => !optedOutSet.has(normalizeAddress(c.phone))).length;
    }

    const filtered = patients.filter((p) => {
      if (!p.phone) return false;
      if (scope === "marketing" ? !p.marketing_consent : !p.care_communications_consent) return false;
      if (optedOutSet.has(normalizeAddress(p.phone))) return false;
      if (f.segment === "health" && !String(p.health_concern ?? "").toLowerCase().includes(f.keyword.toLowerCase())) return false;
      if (f.campaignType === "emergency") {
        return appointments.some(
          (a) =>
            a.patient_id === p.id &&
            a.location_id === f.locationId &&
            a.resource_id === f.resourceId &&
            a.starts_at.slice(0, 10) === f.appointmentDate &&
            ["pending", "payment_pending", "confirmed", "arrived", "rescheduling_required"].includes(a.status)
        );
      }
      return true;
    });

    return filtered.length;
  }, [patients, appointments, optOuts, f, csvContacts]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    if (f.segment === "csv" && csvContacts.length === 0) {
      setError("Please upload a valid CSV file containing patient contact numbers.");
      setBusy(false);
      return;
    }

    const payload = {
      ...f,
      csvContacts: f.segment === "csv" ? csvContacts : undefined,
    };

    const r = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error ?? "Could not create campaign.");
    } else {
      setOpen(false);
      setCsvContacts([]);
      setCsvMeta(null);
      setCsvFileName("");
      router.refresh();
    }
    setBusy(false);
  }

  async function action(id: string, actionName: string) {
    setBusy(true);
    setError("");
    const r = await fetch("/api/campaigns", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action: actionName }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error ?? "Campaign could not be updated.");
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="campaign-page">
      <section className="campaign-hero">
        <div>
          <span className="app-eyebrow">CONSENT-FIRST OUTREACH</span>
          <h2>Reach the right patients—never the wrong ones.</h2>
          <p>Coordinate care updates, festive greetings, health camps and emergency notices with consent and opt-out safeguards built in.</p>
        </div>
        <button onClick={() => setOpen(true)}>New campaign →</button>
      </section>

      <section className="campaign-metrics">
        <article>
          <span>Patient profiles</span>
          <b>{patients.length}</b>
          <small>Available in CRM</small>
        </article>
        <article>
          <span>Care consent</span>
          <b>{patients.filter((p) => p.care_communications_consent).length}</b>
          <small>Before audience filters</small>
        </article>
        <article>
          <span>Delivered</span>
          <b>{campaigns.reduce((n, c) => n + c.delivered_count, 0)}</b>
          <small>{campaigns.reduce((n, c) => n + c.read_count, 0)} read</small>
        </article>
        <article>
          <span>Opt-outs</span>
          <b>{optOuts.length}</b>
          <small>Always excluded</small>
        </article>
      </section>

      <section className="campaign-panel">
        <header>
          <div>
            <span className="app-eyebrow">CAMPAIGN OPERATIONS</span>
            <h3>Care communication queue</h3>
          </div>
          <span>{campaigns.length} campaigns</span>
        </header>
        {campaigns.length === 0 ? (
          <div className="campaign-empty">
            <b>No campaigns yet</b>
            <span>Create a consent-safe campaign.</span>
          </div>
        ) : (
          <div className="campaign-list">
            {campaigns.map((c) => (
              <article key={c.id}>
                <i>{c.campaign_type[0].toUpperCase()}</i>
                <div>
                  <b>{c.name}</b>
                  <span>
                    {c.campaign_type} · {c.scheduled_for ? new Date(c.scheduled_for).toLocaleString() : "Draft"}
                  </span>
                  <small>
                    {c.sent_count} sent · {c.read_count} read · {c.failed_count} failed · {c.skipped_count} excluded
                  </small>
                </div>
                <div>
                  <b>{c.eligible_count}</b>
                  <span>eligible</span>
                </div>
                <div>
                  <b>{c.delivered_count}</b>
                  <span>delivered</span>
                </div>
                <div className="campaign-ops">
                  <em>{c.status}</em>
                  {["scheduled", "running"].includes(c.status) && (
                    <button disabled={busy} onClick={() => action(c.id, "pause")}>
                      Pause
                    </button>
                  )}
                  {c.status === "paused" && (
                    <button disabled={busy} onClick={() => action(c.id, "resume")}>
                      Resume
                    </button>
                  )}
                  {["scheduled", "paused"].includes(c.status) && (
                    <button disabled={busy} onClick={() => action(c.id, "send_now")}>
                      Send now
                    </button>
                  )}
                  {!["completed", "cancelled"].includes(c.status) && (
                    <button className="danger" disabled={busy} onClick={() => action(c.id, "cancel")}>
                      Cancel
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {error && <p className="care-error">{error}</p>}
      </section>

      <section className="campaign-safety">
        <b>OmniRelay safety gate</b>
        <p>Consent, opt-outs and affected appointments are re-evaluated by the server. Dispatch remains blocked until the matching Meta template is approved.</p>
      </section>

      {open && (
        <div className="care-modal-backdrop">
          <form className="care-modal" onSubmit={submit}>
            <header>
              <div>
                <span className="app-eyebrow">NEW CAMPAIGN</span>
                <h3>Build a safe audience</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>

            <label>
              Name
              <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Diwali Greeting 2026 or Free Health Camp" />
            </label>

            <label>
              Type
              <select value={f.campaignType} onChange={(e) => setF({ ...f, campaignType: e.target.value, templateId: "" })}>
                <option value="care">Care update</option>
                <option value="marketing">Marketing / news (Festive, health camps, announcements)</option>
                <option value="emergency">Emergency chamber notice</option>
              </select>
            </label>

            {f.campaignType !== "emergency" && (
              <label>
                Audience source
                <select value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value })}>
                  <option value="all">All consented CRM patients</option>
                  <option value="health">Filter by health concern keyword</option>
                  <option value="csv">Import audience from CSV file</option>
                </select>
              </label>
            )}

            {f.segment === "health" && f.campaignType !== "emergency" && (
              <label>
                Concern keyword
                <input required value={f.keyword} onChange={(e) => setF({ ...f, keyword: e.target.value })} placeholder="e.g. Diabetes, Cardiology" />
              </label>
            )}

            {/* CSV Audience File Upload Section */}
            {f.segment === "csv" && f.campaignType !== "emergency" && (
              <div className="wide p-4 rounded-xl border border-dashed border-[#159ab6] bg-[#f7fcfd] space-y-2">
                <div className="flex items-center justify-between">
                  <b className="text-xs text-[#1e3a4b]">Upload Patient Contacts CSV</b>
                  <button type="button" className="text-xs text-[#087fa3] font-bold underline" onClick={downloadSampleCsv}>
                    📥 Download Sample CSV
                  </button>
                </div>
                <input type="file" accept=".csv" onChange={handleCsvFile} className="w-full text-xs" />
                {csvFileName && (
                  <p className="text-xs text-[#059669] font-medium">
                    ✓ {csvFileName} loaded: {csvContacts.length} valid numbers
                    {csvMeta ? ` (${csvMeta.duplicateCount} duplicates, ${csvMeta.invalidCount} invalid rows skipped)` : ""}
                  </p>
                )}
                <small className="block text-[11px] text-[#64748b]">
                  Accepts CSV with columns: <code>Name, Phone, Notes</code>. Indian (+91) and international numbers are supported.
                </small>
              </div>
            )}

            {f.campaignType === "emergency" && (
              <>
                <p className="wide rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  Doctor-specific emergency only. OmniRelay will never notify other doctors&apos; patients sharing the chamber.
                </p>
                <label>
                  Doctor
                  <select required value={f.resourceId} onChange={(e) => setF({ ...f, resourceId: e.target.value })}>
                    <option value="">Select doctor</option>
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Chamber
                  <select required value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>
                    <option value="">Select chamber</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Affected date
                  <input required type="date" value={f.appointmentDate} onChange={(e) => setF({ ...f, appointmentDate: e.target.value })} />
                </label>
                <label>
                  Appointment action
                  <select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}>
                    <option value="reschedule_required">Mark future appointments for rescheduling</option>
                    <option value="notify_only">Notify only — staff will decide each appointment</option>
                  </select>
                </label>
              </>
            )}

            <label>
              Approved template
              <select required value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}>
                <option value="">Select template</option>
                {approved.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.provider_template_name} · {t.language_code}
                  </option>
                ))}
              </select>
              {approved.length === 0 && <small>No approved template for this type yet.</small>}
            </label>

            <label>
              Schedule
              <input type="datetime-local" value={f.scheduledFor} onChange={(e) => setF({ ...f, scheduledFor: e.target.value })} />
            </label>

            <label className="wide">
              Patient-safe message/context
              <textarea
                required
                minLength={3}
                maxLength={1000}
                rows={3}
                value={f.messageNote}
                onChange={(e) => setF({ ...f, messageNote: e.target.value })}
                placeholder="Message summary or context for audit records"
              />
              <small>Do not include diagnosis, reports or other sensitive clinical details.</small>
            </label>

            {f.campaignType === "emergency" && (
              <div className="campaign-preview wide">
                <b>Patient message preview</b>
                <span>{emergencyPreview}</span>
              </div>
            )}

            <div className="campaign-preview wide">
              <b>{eligibleCount} eligible recipients</b>
              <span>
                {f.segment === "csv"
                  ? "Filtered by WhatsApp formatting, duplicates, and communication opt-out registry"
                  : `${patients.length - eligibleCount} excluded by consent, opt-out and affected-appointment safeguards`}
              </span>
            </div>

            {error && <p className="care-error wide">{error}</p>}

            <button
              className="care-submit wide"
              disabled={busy || !approved.length || eligibleCount === 0}
            >
              {busy ? "Creating…" : "Create scheduled campaign"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
