"use client";

export type CampaignItem = {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  scheduled_for: string | null;
  eligible_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  skipped_count: number;
};

export interface CampaignListProps {
  campaigns: CampaignItem[];
  busy: boolean;
  error?: string;
  onAction: (id: string, actionName: "pause" | "resume" | "send_now" | "cancel") => void;
}

export function CampaignList({ campaigns, busy, error, onAction }: CampaignListProps) {
  return (
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
                  <button disabled={busy} onClick={() => onAction(c.id, "pause")}>
                    Pause
                  </button>
                )}
                {c.status === "paused" && (
                  <button disabled={busy} onClick={() => onAction(c.id, "resume")}>
                    Resume
                  </button>
                )}
                {["scheduled", "paused"].includes(c.status) && (
                  <button disabled={busy} onClick={() => onAction(c.id, "send_now")}>
                    Send now
                  </button>
                )}
                {!["completed", "cancelled"].includes(c.status) && (
                  <button className="danger" disabled={busy} onClick={() => onAction(c.id, "cancel")}>
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
  );
}
