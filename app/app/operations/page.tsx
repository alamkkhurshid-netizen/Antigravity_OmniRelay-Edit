import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { RecoveryActions, type RecoverableIncident } from "./recovery-actions";
import { failureCategoryLabel, whatsappFailure } from "@/lib/whatsapp-delivery";
import { IncidentControl, type SecurityIncident } from "./incident-control";
import { DataRightsControl, type DataRightRequest } from "./data-rights-control";
import { currentEpochMilliseconds, isoBeforeNow } from "@/lib/time";

type Status = Record<string, unknown> | null;

function stateOf(status: Status) {
  if (!status) return "queued";
  if (status.failed) return "failed";
  if (status.read) return "read";
  if (status.delivered) return "delivered";
  if (status.sent || status.accepted) return "sent";
  return "queued";
}

export default async function OperationsPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currentTime = currentEpochMilliseconds();
  const since = isoBeforeNow(24 * 60 * 60 * 1000);
  const [{ data: messages }, { data: appointmentRuns }, { data: careRuns }, { data: connection }, { data: recoveries }, { data: securityIncidents }, { data: currentAgent }, {data:dataRequests}] = await Promise.all([
    supabase.from("messages").select("id,conversation_id,direction,status,timestamp,content").eq("organization_id", organization.id).eq("direction", "outgoing").gte("timestamp", since).order("timestamp", { ascending: false }).limit(100),
    supabase.from("reminder_events").select("id,event_type,status,scheduled_for,attempts,max_attempts,failure_reason,next_attempt_at").eq("organization_id", organization.id).gte("scheduled_for", since).order("scheduled_for", { ascending: false }).limit(100),
    supabase.from("care_reminder_runs").select("id,status,scheduled_for,attempt_count,max_attempts,failure_reason,next_attempt_at").eq("organization_id", organization.id).gte("scheduled_for", since).order("scheduled_for", { ascending: false }).limit(100),
    supabase.from("channel_connections").select("status,display_name,display_address,last_verified_at").eq("organization_id", organization.id).eq("channel", "whatsapp").maybeSingle(),
    supabase.from("automation_recovery_events").select("id,job_kind,job_id,reason,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("security_incidents").select("id,reference,severity,category,status,title,safe_summary,containment_summary,resolution_summary,created_at,updated_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).maybeSingle(),
    supabase.from("patient_data_requests").select("id,reference,request_type,status,request_summary,identity_method,identity_verified_at,retention_review,retention_reason,decision_summary,created_at,updated_at,patient_profiles(full_name)").eq("organization_id",organization.id).order("created_at",{ascending:false}).limit(100),
  ]);

  const delivery = (messages ?? []).map((item) => ({ ...item, delivery: stateOf(item.status as Status) }));
  const failedMessages = delivery.filter((item) => item.delivery === "failed");
  const providerFailures = failedMessages.map((item) => ({ item, failure: whatsappFailure(item.status as Status) })).filter((entry) => entry.failure);
  const failureCategories = providerFailures.reduce<Record<string, number>>((counts, entry) => {
    const label = failureCategoryLabel(entry.failure!.category);
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});
  const delayedMessages = delivery.filter((item) => item.delivery === "queued" && currentTime - new Date(item.timestamp).getTime() > 5 * 60 * 1000);
  const failedAppointmentJobs = (appointmentRuns ?? []).filter((item) => item.status === "failed");
  const failedCareJobs = (careRuns ?? []).filter((item) => item.status === "failed");
  const failedJobs = [...failedAppointmentJobs, ...failedCareJobs];
  const retryingJobs = [...(appointmentRuns ?? []), ...(careRuns ?? [])].filter((item) => ["scheduled", "approved", "processing"].includes(item.status) && item.next_attempt_at);
  const healthy = connection && ["test", "live"].includes(connection.status) && failedMessages.length === 0 && delayedMessages.length === 0;
  const incidents = [
    ...providerFailures.map(({ item, failure }) => ({ id: item.id, title: failure!.title, detail: failure!.action, at: item.timestamp, kind: "failed" })),
    ...delayedMessages.map((item) => ({ id: item.id, title: "WhatsApp delivery delayed", detail: "The message has remained queued for more than five minutes.", at: item.timestamp, kind: "delayed" })),
    ...failedJobs.map((item) => ({ id: item.id, title: "Reminder reached its retry limit", detail: item.failure_reason ?? "The reminder worker could not complete delivery.", at: item.scheduled_for, kind: "failed" })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 20);
  const recoverable: RecoverableIncident[] = [
    ...failedAppointmentJobs.map((item) => ({ id: item.id, kind: "appointment_reminder" as const, title: "Appointment reminder exhausted", detail: item.failure_reason ?? "Automatic delivery attempts were exhausted.", at: item.scheduled_for })),
    ...failedCareJobs.map((item) => ({ id: item.id, kind: "care_reminder" as const, title: "Care reminder exhausted", detail: item.failure_reason ?? "Automatic delivery attempts were exhausted.", at: item.scheduled_for })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return <main className="operations-page">
    <section className={`operations-hero ${healthy ? "healthy" : "attention"}`}>
      <div><span className="app-eyebrow">LIVE OPERATIONS</span><h2>{healthy ? "Your delivery system is healthy." : "A delivery issue needs attention."}</h2><p>One place to monitor WhatsApp, appointment reminders and patient-care automations.</p></div>
      <aside><i>{healthy ? "✓" : "!"}</i><b>{healthy ? "Operational" : `${incidents.length} incidents`}</b><span>Last 24 hours</span></aside>
    </section>
    <section className="operations-metrics">
      <article><span>WhatsApp connection</span><b>{connection?.status ?? "offline"}</b><small>{connection?.display_address ?? "No number connected"}</small></article>
      <article><span>Failed messages</span><b>{failedMessages.length}</b><small>{delayedMessages.length} delayed</small></article>
      <article><span>Failed reminders</span><b>{failedJobs.length}</b><small>{retryingJobs.length} retrying automatically</small></article>
      <article><span>Delivered or read</span><b>{delivery.filter((item) => ["delivered", "read"].includes(item.delivery)).length}</b><small>Past 24 hours</small></article>
    </section>
    {providerFailures.length > 0 && <section className="provider-failure-summary"><header><div><span className="app-eyebrow">PROVIDER DIAGNOSTICS</span><h3>Why WhatsApp messages failed</h3></div><span>Safe summaries only — patient data is never copied here.</span></header><div>{Object.entries(failureCategories).map(([label, count]) => <article key={label}><b>{count}</b><span>{label}</span></article>)}</div></section>}
    <section className="operations-incidents">
      <header><div><span className="app-eyebrow">EXCEPTION QUEUE</span><h3>Items requiring staff review</h3></div><Link href="/app/conversations">Open WhatsApp inbox →</Link></header>
      {incidents.length ? <div>{incidents.map((item) => <article key={`${item.kind}-${item.id}`}><i className={item.kind}>{item.kind === "failed" ? "!" : "◷"}</i><div><b>{item.title}</b><span>{item.detail}</span></div><time>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(item.at))}</time></article>)}</div> : <div className="operations-empty"><i>✓</i><b>No unresolved delivery incidents</b><span>Automatic retries and provider status updates are operating normally.</span></div>}
    </section>
    <RecoveryActions incidents={recoverable} recoveries={recoveries ?? []} />
    <IncidentControl initialIncidents={(securityIncidents ?? []) as SecurityIncident[]} canManage={["owner", "admin"].includes(String(currentAgent?.extra?.role ?? "member"))} />
    <DataRightsControl initialRequests={(dataRequests??[]) as DataRightRequest[]} canManage={["owner","admin"].includes(String(currentAgent?.extra?.role??"member"))}/>
    <section className="operations-audit"><div><span className="app-eyebrow">RECOVERY AUDIT</span><h3>Recent manual releases</h3></div><b>{recoveries?.length ?? 0}</b><span>Every retry records the staff member, reason, job and time. Patient content is not copied into the audit log.</span></section>
    <section className="operations-actions"><article><b>WhatsApp inbox</b><span>Review failed messages and continue customer conversations.</span><Link href="/app/conversations">Open conversations →</Link></article><article><b>Reminder queue</b><span>Approve, retry or skip care reminders with a complete audit trail.</span><Link href="/app/automations">Open automations →</Link></article><article><b>Channel setup</b><span>Verify the connected Meta account, templates and production number.</span><Link href="/app/integrations">Check integrations →</Link></article></section>
  </main>;
}
