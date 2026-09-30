"use client";

interface IntegrationsPanelProps {
  category: string;
  calendarConnections?: Array<{ resource_id: string | null; expires_at: string }>;
  organizationId: string;
}

export function IntegrationsPanel({
  category, calendarConnections, organizationId
}: IntegrationsPanelProps) {
  return (
    <section className="foundation-section">
      <header>
        <div>
          <span className="app-eyebrow">INTEGRATIONS</span>
          <h2>{category === "Healthcare" ? "Clinic-wide Connections" : "Workspace Integrations"}</h2>
        </div>
      </header>
      <div className="integration-grid">
        <article>
          <i>📅</i>
          <b>
            {category === "Healthcare" ? "Google Calendar (Shared Clinic)" : "Google Calendar (Team Calendar)"}
            <small>{category === "Healthcare" ? "Sync all clinic appointments to a central calendar." : "Sync appointments to a central calendar."}</small>
          </b>
          {calendarConnections?.some(c => c.resource_id === null) ? (
            <span className="connected">Connected</span>
          ) : (
            <a href={`/api/auth/google-calendar?organizationId=${organizationId}`} className="secondary-button" style={{ textDecoration: 'none' }}>Connect</a>
          )}
        </article>
      </div>
    </section>
  );
}
