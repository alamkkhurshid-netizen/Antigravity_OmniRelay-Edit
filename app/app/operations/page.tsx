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

  return <main className="flex flex-col gap-6">
    <section className={`p-8 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-[0_4px_24px_rgba(0,0,0,0.02)] border ${healthy ? "bg-gradient-to-br from-[#f0fcff] to-white border-[#cce8f0]" : "bg-gradient-to-br from-red-50 to-white border-red-100"}`}>
      <div><span className="or-type-label text-[#1688d5] block mb-3">LIVE OPERATIONS</span><h2 className="or-type-page mb-3 text-slate-900">{healthy ? "Your delivery system is healthy." : "A delivery issue needs attention."}</h2><p className="text-slate-600 text-[15px] leading-relaxed max-w-2xl">One place to monitor WhatsApp, appointment reminders and patient-care automations.</p></div>
      <aside className={`flex flex-col items-center justify-center p-5 rounded-xl border bg-white/60 backdrop-blur-sm min-w-[160px] ${healthy ? "border-teal-100 text-teal-800" : "border-red-100 text-red-800"}`}><i className={`not-italic text-2xl mb-1 ${healthy ? "text-teal-500" : "text-red-500"}`}>{healthy ? "✓" : "!"}</i><b className="font-bold text-[15px]">{healthy ? "Operational" : `${incidents.length} incidents`}</b><span className="text-xs font-medium opacity-70 mt-1 uppercase tracking-wider">Last 24 hours</span></aside>
    </section>
    
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <article className="or-stat-card flex flex-col"><span className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">WhatsApp connection</span><b className="or-type-stat my-3 text-slate-800">{connection?.status ?? "offline"}</b><small className="text-[13px] text-slate-500">{connection?.display_address ?? "No number connected"}</small></article>
      <article className="or-stat-card flex flex-col"><span className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">Failed messages</span><b className="or-type-stat my-3 text-slate-800">{failedMessages.length}</b><small className="text-[13px] text-slate-500">{delayedMessages.length} delayed</small></article>
      <article className="or-stat-card flex flex-col"><span className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">Failed reminders</span><b className="or-type-stat my-3 text-slate-800">{failedJobs.length}</b><small className="text-[13px] text-slate-500">{retryingJobs.length} retrying automatically</small></article>
      <article className="or-stat-card flex flex-col"><span className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide">Delivered or read</span><b className="or-type-stat my-3 text-slate-800">{delivery.filter((item) => ["delivered", "read"].includes(item.delivery)).length}</b><small className="text-[13px] text-slate-500">Past 24 hours</small></article>
    </section>

    {providerFailures.length > 0 && <section className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm"><header className="flex flex-col md:flex-row md:items-center justify-between mb-6"><div><span className="or-type-label text-[#1688d5] block mb-2">PROVIDER DIAGNOSTICS</span><h3 className="or-type-section text-slate-900">Why WhatsApp messages failed</h3></div><span className="text-[13px] font-medium bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full">Safe summaries only — patient data is never copied here.</span></header><div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">{Object.entries(failureCategories).map(([label, count]) => <article key={label} className="flex flex-col p-4 bg-slate-50 border border-slate-100 rounded-xl"><b className="or-type-stat text-slate-800 mb-1">{count}</b><span className="text-[13px] font-medium text-slate-600">{label}</span></article>)}</div></section>}
    
    <section className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-6 border-b border-slate-100 pb-4"><div><span className="or-type-label text-[#1688d5] block mb-2">EXCEPTION QUEUE</span><h3 className="or-type-section text-slate-900">Items requiring staff review</h3></div><Link href="/app/conversations" className="text-[13px] font-bold text-[#087fb9] hover:text-[#066494] transition-colors">Open WhatsApp inbox →</Link></header>
      {incidents.length ? <div className="flex flex-col gap-3">{incidents.map((item) => <article key={`${item.kind}-${item.id}`} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors"><i className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center not-italic font-bold text-lg ${item.kind === "failed" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>{item.kind === "failed" ? "!" : "◷"}</i><div className="flex flex-col flex-1"><b className="text-[15px] text-slate-900">{item.title}</b><span className="text-[13px] text-slate-500 mt-1">{item.detail}</span></div><time className="text-[13px] font-medium text-slate-400 whitespace-nowrap">{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(item.at))}</time></article>)}</div> : <div className="flex flex-col items-center justify-center py-10 text-center"><i className="w-12 h-12 rounded-full bg-teal-50 text-teal-500 flex items-center justify-center not-italic text-xl font-bold mb-4">✓</i><b className="text-[15px] text-slate-800">No unresolved delivery incidents</b><span className="text-[13px] text-slate-500 mt-2">Automatic retries and provider status updates are operating normally.</span></div>}
    </section>
    
    <RecoveryActions incidents={recoverable} recoveries={recoveries ?? []} />
    <IncidentControl initialIncidents={(securityIncidents ?? []) as SecurityIncident[]} canManage={["owner", "admin"].includes(String(currentAgent?.extra?.role ?? "member"))} />
    <DataRightsControl initialRequests={(dataRequests??[]) as DataRightRequest[]} canManage={["owner","admin"].includes(String(currentAgent?.extra?.role??"member"))}/>
    
    <section className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6"><div><span className="or-type-label text-[#1688d5] block mb-2">RECOVERY AUDIT</span><h3 className="or-type-section text-slate-900">Recent manual releases</h3><span className="block text-[13px] text-slate-500 mt-2 max-w-xl">Every retry records the staff member, reason, job and time. Patient content is not copied into the audit log.</span></div><b className="or-type-stat text-slate-800">{recoveries?.length ?? 0}</b></section>
    
    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <article className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col hover:border-blue-200 transition-colors group"><b className="or-type-card text-slate-900 mb-2">WhatsApp inbox</b><span className="text-[13px] text-slate-500 mb-6 flex-1">Review failed messages and continue customer conversations.</span><Link href="/app/conversations" className="text-[13px] font-bold text-[#087fb9] group-hover:text-[#066494] transition-colors">Open conversations →</Link></article>
      <article className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col hover:border-blue-200 transition-colors group"><b className="or-type-card text-slate-900 mb-2">Reminder queue</b><span className="text-[13px] text-slate-500 mb-6 flex-1">Approve, retry or skip care reminders with a complete audit trail.</span><Link href="/app/automations" className="text-[13px] font-bold text-[#087fb9] group-hover:text-[#066494] transition-colors">Open automations →</Link></article>
      <article className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col hover:border-blue-200 transition-colors group"><b className="or-type-card text-slate-900 mb-2">Channel setup</b><span className="text-[13px] text-slate-500 mb-6 flex-1">Verify the connected Meta account, templates and production number.</span><Link href="/app/integrations" className="text-[13px] font-bold text-[#087fb9] group-hover:text-[#066494] transition-colors">Check integrations →</Link></article>
    </section>
  </main>;
}
