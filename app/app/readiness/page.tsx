import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { isoBeforeNow } from "@/lib/time";
import { ReadinessWorkspace, readinessDefinitions, type LifecycleEvidence, type ReadinessAuditEvent } from "./readiness-workspace";
import { DepositTestControl } from "./deposit-test-control";
import { ChannelTestControls } from "./channel-test-controls";
import { PilotControl, type PilotControl as PilotControlType } from "./pilot-control";
import { PilotCloseout } from "./pilot-closeout";

type Gate = { title: string; ready: boolean; detail: string; href: string };

export default async function ReadinessPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  const businessCategory = (organization.extra as Record<string, unknown>)?.business_category;
  if (businessCategory === "Retail & e-commerce") {
    redirect("/app/retail");
  }
  const since = isoBeforeNow(24 * 60 * 60 * 1000);

  const [{ data: connection }, { count: locations }, { count: services }, { count: resources }, { count: bookingPages }, { data: templates }, { count: failedMessages }, { count: failedReminders }, { data: manualChecks }, { data: readinessAudit }, { data: pilotControl }, { data: bookingAcceptance }, { data: channelTests }, { data: multiDoctorAcceptance }, { data: commandObservations }, { data: completedAppointments }, { data: encounters }, { data: carePlans }, { data: careTasks }, { data: reminderRuns }] = await Promise.all([
    supabase.from("channel_connections").select("status,display_address,last_verified_at").eq("organization_id", organization.id).eq("channel", "whatsapp").maybeSingle(),
    supabase.from("business_locations").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("active", true),
    supabase.from("organization_services").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("active", true),
    supabase.from("booking_resources").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("active", true),
    supabase.from("booking_pages").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("active", true),
    supabase.from("channel_message_templates").select("event_type,status").eq("organization_id", organization.id).eq("channel", "whatsapp").in("event_type", ["confirmation", "reminder_24h", "reminder_2h", "cancellation", "reschedule", "follow_up", "emergency_notice"]),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("direction", "outgoing").gte("timestamp", since).not("status->failed", "is", null),
    supabase.from("reminder_events").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("status", "failed").gte("scheduled_for", since),
    supabase.from("production_readiness_checks").select("check_key,status,notes,evidence_at,updated_at").eq("organization_id", organization.id),
    supabase.from("team_audit_events").select("id,event_type,summary,metadata,created_at").eq("organization_id", organization.id).in("event_type", ["production_readiness_updated", "clinic_pilot_day_closed"]).order("created_at", { ascending: false }).limit(12),
    supabase.from("clinic_pilot_controls").select("pilot_owner_name,rollback_owner_name,planned_start_date,health_status,health_note,reviewed_at").eq("organization_id",organization.id).maybeSingle(),
    supabase.rpc("get_whatsapp_booking_acceptance", { p_organization_id: organization.id }),
    supabase.from("whatsapp_acceptance_test_runs").select("scenario_key,status,recipient_last4,verified_message_id,subject_payment_id,subject_acceptance_payment_id,dispatch_message_id,max_messages,message_count,expires_at,failure_summary,started_at,updated_at").eq("organization_id",organization.id).order("scenario_key"),
    supabase.rpc("get_multi_doctor_booking_acceptance",{p_organization_id:organization.id}),
    supabase.from("whatsapp_acceptance_observations").select("run_id,observation_key,safe_summary,created_at").eq("organization_id",organization.id).order("created_at"),
    supabase.from("appointments").select("patient_id").eq("organization_id", organization.id).eq("status", "completed").not("patient_id", "is", null),
    supabase.from("patient_encounters").select("id,patient_id").eq("organization_id", organization.id),
    supabase.from("patient_care_plans").select("id,patient_id,encounter_id").eq("organization_id", organization.id).in("status", ["active", "completed"]),
    supabase.from("patient_care_tasks").select("patient_id,care_plan_id,assigned_to").eq("organization_id", organization.id).in("status", ["open", "in_progress", "completed"]),
    supabase.from("care_reminder_runs").select("patient_id,status").eq("organization_id", organization.id).in("status", ["sent", "delivered", "read", "acknowledged"]),
  ]);
  const completedVisitPatients = new Set((completedAppointments ?? []).map((item) => item.patient_id).filter(Boolean));
  const encounterPatients = new Set((encounters ?? []).map((item) => item.patient_id).filter(Boolean));
  const planPatients = new Set((carePlans ?? []).filter((item) => item.encounter_id).map((item) => item.patient_id).filter(Boolean));
  const ownedFollowUpPatients = new Set((careTasks ?? []).filter((item) => item.care_plan_id && item.assigned_to).map((item) => item.patient_id).filter(Boolean));
  const reminderOutcomePatients = new Set((reminderRuns ?? []).map((item) => item.patient_id).filter(Boolean));
  const closedJourneyPatients = [...completedVisitPatients].filter((patientId) => encounterPatients.has(patientId) && planPatients.has(patientId) && ownedFollowUpPatients.has(patientId) && reminderOutcomePatients.has(patientId));
  const lifecycleEvidence: LifecycleEvidence = {
    completedVisits: completedVisitPatients.size,
    carePlanHandoffs: planPatients.size,
    ownedFollowUps: ownedFollowUpPatients.size,
    reminderOutcomes: reminderOutcomePatients.size,
    closedJourneys: closedJourneyPatients.length,
  };
  const requiredTemplates = new Set(["confirmation", "reminder_24h", "reminder_2h", "cancellation", "reschedule", "follow_up", "emergency_notice"]);
  const approvedTemplates = new Set((templates ?? []).filter((item) => item.status === "approved").map((item) => item.event_type));
  const gates: Gate[] = [
    { title: "Production WhatsApp number", ready: connection?.status === "live", detail: connection?.status === "live" ? `Live number ${connection.display_address ?? "connected"}` : `Current mode: ${connection?.status ?? "not connected"}. Test mode is not a production pass.`, href: "/app/integrations" },
    { title: "Clinic booking foundation", ready: Boolean(locations && services && resources && bookingPages), detail: `${locations ?? 0} chambers · ${services ?? 0} services · ${resources ?? 0} providers · ${bookingPages ?? 0} public booking pages`, href: "/app/settings" },
    { title: "Lifecycle templates", ready: [...requiredTemplates].every((key) => approvedTemplates.has(key)), detail: `${[...requiredTemplates].filter((key) => approvedTemplates.has(key)).length}/${requiredTemplates.size} required templates approved`, href: "/app/integrations" },
    { title: "Last-24-hour operations", ready: (failedMessages ?? 0) === 0 && (failedReminders ?? 0) === 0, detail: `${failedMessages ?? 0} failed messages · ${failedReminders ?? 0} failed appointment reminders`, href: "/app/operations" },
  ];
  const manualReady = (manualChecks ?? []).filter((item) => item.status === "ready").length;
  const readyCount = gates.filter((gate) => gate.ready).length + manualReady;
  const total = gates.length + readinessDefinitions.length;
  const launchReady = readyCount === total;
  const acceptanceRows = bookingAcceptance ?? [];
  const acceptanceLabels: Record<string,string> = {consent_identity:"Consent and WhatsApp possession",new_returning_family:"New, returning and family booking",availability_isolation:"Live availability and clinic isolation",concurrency_idempotency:"Overlap and duplicate protection",reschedule_cancel:"Reschedule and cancellation",payments:"Pay-at-clinic and online payment return",reminders_commands_handoff:"Reminders, STOP/START/MENU and handoff",abandoned_recovery:"Abandoned booking recovery"};
  const testLabels: Record<string,string>={deposit_payment:"Deposit payment completion",commands_handoff:"STOP/START and human handoff",abandoned_recovery:"Abandoned booking recovery"};
  const multiDoctorLabels:Record<string,string>={clinic_mode:"Clinic operating mode",department_routing:"Department routing",provider_resolution:"Provider assignment",any_available_doctor:"Any available doctor",booking_safety:"Live slots and concurrency",payment_reschedule_cancel:"Payment and appointment management"};

  return <main className="readiness-page"><section className={`readiness-hero ${launchReady ? "ready" : "blocked"}`}><div><span className="app-eyebrow">CLINIC PRODUCTION GATE</span><h2>{launchReady ? "Clinic pilot is cleared for controlled launch." : "Clinic launch still has open gates."}</h2><p>This control room combines live technical evidence with accountable owner sign-off. It does not mark a clinic ready based on assumptions.</p></div><aside><b>{readyCount}/{total}</b><span>gates ready</span><i>{launchReady ? "GO" : "HOLD"}</i></aside></section>
    <section className="readiness-gates"><header><div><span className="app-eyebrow">AUTOMATIC EVIDENCE</span><h3>Live system checks</h3></div><span>{gates.filter((gate) => gate.ready).length}/{gates.length} passing</span></header><div>{gates.map((gate) => <article className={gate.ready ? "ready" : "blocked"} key={gate.title}><i>{gate.ready ? "✓" : "!"}</i><div><b>{gate.title}</b><span>{gate.detail}</span></div><Link href={gate.href}>{gate.ready ? "Review" : "Resolve"} →</Link></article>)}</div></section>
    <section className="readiness-rule"><b>Phase 1 closure direction</b><span>Prove one controlled patient lifecycle: WhatsApp booking, completed visit, care-plan or prescription handoff, named follow-up owner, and one consented reminder outcome. This records evidence only; it does not send messages or change patient records.</span></section>
    <ReadinessWorkspace initialChecks={manualChecks ?? []} lifecycleEvidence={lifecycleEvidence} evidenceHistory={(readinessAudit ?? []) as ReadinessAuditEvent[]}/>
    <PilotControl initial={pilotControl as PilotControlType|null}/>
    <PilotCloseout />
    <section className="readiness-acceptance"><header><div><span className="app-eyebrow">WHATSAPP BOOKING CONCIERGE</span><h3>Production-acceptance evidence</h3></div><span>{acceptanceRows.filter((item) => item.status === "passed").length}/8 passed</span></header><p>The first four checks are evaluated automatically without sending messages or reading patient identity. Controlled-channel tests close the remaining gates.</p><div>{Object.entries(acceptanceLabels).map(([key,title])=>{const row=acceptanceRows.find((item)=>item.check_key===key);const state=row?.status??"pending";return <article className={state} key={key}><i>{state==="passed"?"✓":state==="failed"?"!":"○"}</i><div><b>{title}</b><span>{row?.evidence_summary??"Evidence not recorded yet."}</span>{row?.tested_at&&<small>{row.evidence_kind.replaceAll("_"," ")} evidence · {new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit",timeZone:"Asia/Kolkata"}).format(new Date(row.tested_at))}</small>}</div><em>{state}</em></article>})}</div></section>
    <section className="readiness-channel-tests"><header><div><span className="app-eyebrow">CONTROLLED CHANNEL HARNESS</span><h3>Final synthetic tests</h3></div><span>Kill switch active</span></header><p>No test can run without a delivery-verified recipient. Atomic leases prevent duplicate execution; deposit payment returns close their gate automatically.</p><div>{Object.entries(testLabels).map(([key,title])=>{const row=(channelTests??[]).find((item)=>item.scenario_key===key);const state=row?.status??"draft";return <article key={key}><div><b>{title}</b><span>{state==="draft"?"Dormant · verified recipient required":`Delivery-verified ••••${row?.recipient_last4??""} · ${row?.message_count??0}/${row?.max_messages??1} messages${row?.subject_payment_id||row?.subject_acceptance_payment_id?" · isolated payment attached":""}`}</span>{row?.failure_summary&&<small>{row.failure_summary}</small>}</div><em className={state}>{state}</em></article>})}</div></section>
    <DepositTestControl status={(channelTests??[]).find((item)=>item.scenario_key==="deposit_payment")?.status??"draft"}/>
    <ChannelTestControls controls={[
      {scenario:"commands_handoff",title:"STOP / START / MENU and human handoff",detail:"Maximum three controlled messages; validates preferences and operator escalation.",status:(channelTests??[]).find((item)=>item.scenario_key==="commands_handoff")?.status??"draft"},
      {scenario:"abandoned_recovery",title:"Abandoned booking recovery",detail:"Maximum one controlled recovery message. Safely expires only the verified recipient’s idle welcome session; no appointment or patient record is created.",status:(channelTests??[]).find((item)=>item.scenario_key==="abandoned_recovery")?.status??"draft"},
    ]}/>
    <section className="readiness-acceptance"><header><div><span className="app-eyebrow">COMMAND EXECUTOR</span><h3>Verified command cycle</h3></div><span>{new Set((commandObservations??[]).map(item=>item.observation_key)).size}/4 observed</span></header><p>After the test is prepared, use only the delivery-verified WhatsApp recipient. Send STOP, then START, then choose Human assistance. START also verifies the MENU response.</p><div>{[["stop","STOP opt-out"],["start","START restoration"],["menu","MENU rendering"],["handoff","Human handoff"]].map(([key,title])=>{const row=(commandObservations??[]).find(item=>item.observation_key===key);return <article className={row?"passed":"pending"} key={key}><i>{row?"✓":"○"}</i><div><b>{title}</b><span>{row?.safe_summary??"Waiting for verified response evidence."}</span></div><em>{row?"passed":"pending"}</em></article>})}</div></section>
    <section className="readiness-acceptance"><header><div><span className="app-eyebrow">MULTI-DOCTOR ACCEPTANCE</span><h3>Department-to-doctor routing</h3></div><span>{(multiDoctorAcceptance??[]).filter((item)=>item.status==="passed").length}/{(multiDoctorAcceptance??[]).filter((item)=>item.status!=="not_applicable").length||1} applicable checks passed</span></header><p>This matrix reads configuration only. It never creates a patient, appointment, payment, or WhatsApp message.</p><div>{Object.entries(multiDoctorLabels).map(([key,title])=>{const row=(multiDoctorAcceptance??[]).find((item)=>item.check_key===key);const state=row?.status??"pending";return <article className={state} key={key}><i>{state==="passed"?"✓":state==="failed"?"!":state==="not_applicable"?"—":"○"}</i><div><b>{title}</b><span>{row?.evidence_summary??"Acceptance evidence is not available."}</span></div><em>{state.replaceAll("_"," ")}</em></article>})}</div></section>
    <section className="readiness-rule"><b>Controlled pilot rule</b><span>Start with one clinic, named staff, test patients and a documented rollback contact. Restaurant and Retail packs remain outside this gate.</span></section>
  </main>;
}
