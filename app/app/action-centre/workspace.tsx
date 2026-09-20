"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, CircleAlert, ClipboardCheck, SendHorizontal, ShieldAlert, ArrowUpRight, Clock3, Inbox, LockKeyhole, UserRoundCheck } from "lucide-react";
import { Joyride, Step } from "react-joyride";

type CareRun = { id:string; status:string; scheduled_for:string; attempt_count:number; max_attempts:number; failure_reason:string|null; channel:string; patient:{full_name:string;phone:string|null;care_communications_consent:boolean}|null; reminder:{title:string;reminder_type:string;approval_mode:string}|null };
type AppointmentRun = { id:string; event_type:string; status:string; scheduled_for:string; attempts:number; max_attempts:number; failure_reason:string|null; appointment:{customer_name:string;customer_phone:string|null;care_communications_consent:boolean}|null };
type Task = { id:string;title:string;details:string|null;due_at:string|null;priority:string;status:string;patient:{full_name:string}|null };
type Deployment = {id:string;status:string;deployed_count:number;automatic_count:number;exception_count:number;created_at:string};
type BookingRequest = {id:string;patient_name:string;starts_at:string;status:string;service:{name:string}|null;location:{name:string}|null;resource:{name:string}|null};
type WaitlistItem={id:string;patient_name:string;preferred_date:string;status:string;priority:number;service:{name:string}|null;location:{name:string}|null;resource:{name:string}|null};
type Disruption={id:string;starts_at:string;ends_at:string;exception_type:string;reason:string;status:string;resource:{name:string}|null;location:{name:string}|null};
type EmergencyRecipient={id:string;status:string;failure_reason:string|null;patient:{full_name:string}|null;campaign:{campaign_type:string;status:string}|null};
type Assignment={item_kind:string;subject_id:string;assigned_to:string|null;status:string;updated_at:string};
type ReadinessCheck={id:string;check_key:string;status:string;notes:string|null;updated_at:string};
type PilotControl={pilot_owner_name:string;rollback_owner_name:string;planned_start_date:string|null;health_status:"go"|"hold";health_note:string|null;reviewed_at:string};
type AiDraft={id:string;agent_role:string;proposed_action:string;draft_payload:Record<string, unknown>;created_at:string};
type ExceptionItem = {id:string;kind:"care_retry"|"appointment_retry"|"booking_approval"|"waitlist"|"schedule_disruption"|"blocked"|"care_task"|"agent_draft";type:string;name:string;detail:string;priority:string;href:string;status?:string;rank:number;assignment?:Assignment;draft_payload?:Record<string, unknown>};

const when = (value:string) => new Intl.DateTimeFormat("en-IN", { day:"numeric", month:"short", hour:"numeric", minute:"2-digit", timeZone:"Asia/Kolkata" }).format(new Date(value));
const clinicDay = (value:string) => new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Kolkata" }).format(new Date(value));

export function ActionCentreWorkspace({careRuns,appointmentRuns,tasks,deployments,bookingRequests,waitlist,disruptions,emergencyRecipients,assignments,readinessChecks,pilotControl,aiDrafts,currentUserId,canManageNotifications,nowIso}:{careRuns:CareRun[];appointmentRuns:AppointmentRun[];tasks:Task[];deployments:Deployment[];bookingRequests:BookingRequest[];waitlist:WaitlistItem[];disruptions:Disruption[];emergencyRecipients:EmergencyRecipient[];assignments:Assignment[];readinessChecks:ReadinessCheck[];pilotControl:PilotControl|null;aiDrafts:AiDraft[];currentUserId:string;canManageNotifications:boolean;nowIso:string}) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [working,setWorking]=useState<string|null>(null);
  const [result,setResult]=useState<{deployed_count:number;automatic_count:number;exception_count:number}|null>(null);
  
  const isDemo = aiDrafts.some(d => d.draft_payload?.metadata?.demo === true);
  const [runTour, setRunTour] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isDemo) setRunTour(true);
  }, [isDemo]);

  const tourSteps: Step[] = [
    {
      target: '.sandbox-step-intro',
      content: 'Welcome to your OmniRelay Sandbox! Let\'s see how your AI Employee manages your daily workflow.',
      disableBeacon: true,
    },
    {
      target: '.sandbox-step-queue',
      content: 'This is the Priority Review Queue. Hermes has prepared 3 actions for you based on the mock data.',
    },
    {
      target: '.sandbox-step-discuss',
      content: 'This is where the magic happens. Click "Discuss / Refine" to talk to the AI. Give it feedback (e.g. "make the discount 20%") and watch it rewrite the draft instantly!',
    }
  ];

  const now=new Date(nowIso).getTime();
  const dueCare=careRuns.filter(r=>new Date(r.scheduled_for).getTime()<=now);
  const releasable=dueCare.filter(r=>r.channel==="whatsapp"&&(r.status==="ready"||(r.status==="failed"&&r.attempt_count<r.max_attempts))&&r.patient?.care_communications_consent&&r.patient?.phone);
  const automaticCare=dueCare.filter(r=>r.status==="approved");
  const automaticAppointments=appointmentRuns.filter(r=>r.status==="scheduled"&&new Date(r.scheduled_for).getTime()<=now);
  const careExceptions=dueCare.filter(r=>r.status==="skipped"||(r.status==="failed"&&r.attempt_count>=r.max_attempts)||!r.patient?.care_communications_consent||!r.patient?.phone);
  const appointmentExceptions=appointmentRuns.filter(r=>r.status==="failed");
  const taskExceptions=tasks.filter(t=>["high","urgent"].includes(t.priority)||(t.due_at&&new Date(t.due_at).getTime()<=now));
  const withOwner=(item:Omit<ExceptionItem,"assignment">):ExceptionItem=>({...item,assignment:assignments.find(a=>a.item_kind===item.kind&&a.subject_id===item.id)});
  const pilotDecisionFresh = Boolean(pilotControl && clinicDay(pilotControl.reviewed_at) === clinicDay(nowIso));
  const pilotControlException = !pilotControl || pilotControl.health_status === "hold" || !pilotDecisionFresh ? withOwner({id:"clinic-pilot-control",kind:"blocked" as const,type:"Clinic pilot launch hold",name:!pilotControl?"Pilot decision is missing":pilotControl.health_status === "hold"?"Pilot decision is HOLD":"Pilot GO decision needs renewal",detail:!pilotControl?"Record the named pilot owner, rollback owner and daily GO/HOLD decision before any controlled clinic day.":pilotControl.health_status === "hold"?`Held by ${pilotControl.pilot_owner_name}. Rollback owner: ${pilotControl.rollback_owner_name}.${pilotControl.planned_start_date?` Planned start: ${pilotControl.planned_start_date}.`:""}${pilotControl.health_note?` ${pilotControl.health_note}`:""}`:`GO was recorded on ${when(pilotControl.reviewed_at)}. Reconfirm the named owners and GO decision for today’s clinic day.`,priority:"urgent",rank:99,href:"/app/readiness"}) : null;
  const exceptions:ExceptionItem[]=[...(pilotControlException?[pilotControlException]:[]),...readinessChecks.map(item=>withOwner({id:item.id,kind:"blocked" as const,type:"Clinic launch gate blocked",name:item.check_key.replaceAll("_"," "),detail:item.notes??"Owner evidence is required before controlled clinic launch.",priority:"urgent",rank:98,href:"/app/readiness"})),...aiDrafts.map(r=>withOwner({id:r.id,kind:"agent_draft" as const,type:`AI Draft: ${r.proposed_action}`,name:`Agent: ${r.agent_role}`,detail:typeof r.draft_payload?.text === 'string' ? r.draft_payload.text : 'Review required.',priority:"urgent",rank:105,href:"#",draft_payload:r.draft_payload})),...bookingRequests.map(r=>withOwner({id:r.id,kind:"booking_approval" as const,type:"Booking approval required",name:r.patient_name,detail:`${r.service?.name??"Appointment"} · ${r.location?.name??"Clinic"} · ${r.resource?.name??"Provider"} · ${when(r.starts_at)}`,priority:"urgent",rank:100,href:"/app/booking-concierge#booking-requests"})),...disruptions.map(r=>withOwner({id:r.id,kind:"schedule_disruption" as const,type:`${r.exception_type.replaceAll("_"," ")} disruption`,name:r.resource?.name??"Clinic schedule",detail:`${r.location?.name??"All locations"} · ${when(r.starts_at)} · ${r.reason}`,priority:"urgent",rank:95,href:"/app/appointments"})),...emergencyRecipients.map(r=>withOwner({id:r.id,kind:"blocked" as const,type:"Emergency notice needs manual contact",name:r.patient?.full_name??"Patient",detail:r.failure_reason??"WhatsApp emergency notice was not delivered. Call the patient and record the outcome.",priority:"urgent",rank:94,href:"/app/campaigns"})),...waitlist.map(r=>withOwner({id:r.id,kind:"waitlist" as const,type:"Waitlist follow-up",name:r.patient_name,detail:`${r.service?.name??"Appointment"} · ${r.location?.name??"Clinic"} · preferred ${r.preferred_date}`,priority:r.status==="offered"?"urgent":"high",rank:r.status==="offered"?90:70,href:"/app/booking-concierge#waitlist"})),...careExceptions.map(r=>withOwner({id:r.id,kind:r.status==="failed"?"care_retry" as const:"blocked" as const,type:r.status==="failed"?"Care reminder failed":"Reminder blocked",name:r.patient?.full_name??"Patient",detail:r.failure_reason??(!r.patient?.care_communications_consent?"Care communication consent is missing.":"Patient mobile number is missing."),priority:"high",rank:65,href:r.status==="failed"?"/app/operations":"/app/automations"})),...appointmentExceptions.map(r=>withOwner({id:r.id,kind:"appointment_retry" as const,type:"Appointment message failed",name:r.appointment?.customer_name??"Patient",detail:r.failure_reason??"Delivery requires review.",priority:"high",rank:60,href:"/app/operations"})),...taskExceptions.map(t=>{const overdue=!!t.due_at&&new Date(t.due_at).getTime()<=now;return withOwner({id:t.id,kind:"care_task" as const,type:overdue?`Overdue follow-up · ${t.title}`:t.title,name:t.patient?.full_name??"Patient",detail:`${overdue&&t.due_at?`Due ${when(t.due_at)} · `:""}${t.details??"Staff review required."}`,priority:t.priority,rank:overdue?88:t.priority==="urgent"?85:t.priority==="high"?55:40,href:"/app/contacts",status:t.status})})].sort((a,b)=>b.rank-a.rank);
  const routine=useMemo(()=>[
    {label:"Medication and care reminders",count:releasable.length+automaticCare.length,detail:`${releasable.length} ready for release · ${automaticCare.length} already automatic`,tone:"care"},
    {label:"Appointment lifecycle messages",count:automaticAppointments.length,detail:"Confirmation, reminder, reschedule and follow-up events due now",tone:"appointment"},
    {label:"Human review retained",count:exceptions.length,detail:"Clinical, consent or delivery exceptions are never batch-sent",tone:"exception"},
  ],[releasable.length,automaticCare.length,automaticAppointments.length,exceptions.length]);

  async function deploy(){
    if(deployable===0)return;
    if(!window.confirm(`Deploy ${deployable} safe action${deployable===1?"":"s"} now? Only consented, due WhatsApp care actions will be sent. Approvals, failed messages and clinic holds will remain for individual review.`))return;
    setBusy(true);setError("");setResult(null);const response=await fetch("/api/action-centre",{method:"POST"});const body=await response.json().catch(()=>({}));if(!response.ok)setError(body.error??"Routine actions could not be deployed.");else{setResult(body.deployment);router.refresh()}setBusy(false)
  }

  async function updateTask(item:ExceptionItem,status:"in_progress"|"completed"){
    setWorking(item.id);setError("");setNotice("");
    const response=await fetch("/api/patients/tasks",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id,status})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)setError(body.error??"The care task could not be updated.");
    else{setNotice(status==="completed"?"Care task completed and removed from the queue.":"Care task marked in progress.");router.refresh()}
    setWorking(null);
  }

  async function retry(item:ExceptionItem){
    const reason=window.prompt("What was reviewed before releasing one audited retry?","Channel and template configuration reviewed by clinic team");
    if(!reason)return;
    setWorking(item.id);setError("");setNotice("");
    const response=await fetch("/api/operations/retry",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id,kind:item.kind==="care_retry"?"care_reminder":"appointment_reminder",reason})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)setError(body.error??"The failed message could not be released.");
    else{setNotice("Released for one audited retry. Delivery will continue automatically.");router.refresh()}
    setWorking(null);
  }

  async function coordinate(item:ExceptionItem,action:"claim"|"review"|"release"){
    if(item.kind==="blocked")return;
    setWorking(item.id);setError("");setNotice("");
    const response=await fetch("/api/action-centre/ownership",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:item.kind,subjectId:item.id,action})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)setError(body.error??"Action ownership could not be updated.");
    else{setNotice(action==="claim"?"Action claimed. Other administrators can see the owner.":action==="review"?"Review recorded. Complete the source action in its dedicated workspace.":"Action released to the clinic queue.");router.refresh()}
    setWorking(null);
  }

  async function testMobileAlert(){
    setWorking("mobile-alert-test");setError("");setNotice("");
    const response=await fetch("/api/notifications/test",{method:"POST"});
    const body=await response.json().catch(()=>({})) as {error?:string;active_devices?:number};
    if(!response.ok)setError(body.error??"The test alert could not be created.");
    else if((body.active_devices??0)===0)setNotice("Test created, but no enabled device is registered for your account. Use Enable mobile alerts first.");
    else setNotice(`Test mobile alert created for ${body.active_devices} enabled device${body.active_devices===1?"":"s"}. It should arrive within one minute.`);
    setWorking(null);
  }

  async function archiveHistoricalAlerts(){
    if(!window.confirm("Archive only stale or older-than-24-hour failed reminder alerts? This will not resend any WhatsApp message."))return;
    setWorking("archive-historical-alerts");setError("");setNotice("");
    const response=await fetch("/api/notifications/historical",{method:"POST"});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)setError(body.error??"Historical alerts could not be archived.");
    else{setNotice(`${body.archived??0} historical alert${body.archived===1?"":"s"} archived. No patient message was sent.`);router.refresh()}
    setWorking(null);
  }

  async function resolveDraft(item:ExceptionItem, action:"approve"|"reject"|"edit") {
    let feedback = "";
    if (action === "reject") {
      feedback = window.prompt("Why are you rejecting this? (The AI will learn from this)","") || "";
      if (!feedback) return;
    }
    if (action === "edit") {
      feedback = window.prompt("What should the AI change? (It will revise the draft and resubmit)","") || "";
      if (!feedback) return;
    }
    
    setWorking(item.id);setError("");setNotice("");
    const { resolveAgentDraft } = await import("./actions");
    const result = await resolveAgentDraft(item.id, action, feedback);
    if (!result.success) setError("Failed to resolve AI draft.");
    else { setNotice(`AI draft ${action}d successfully.`); }
    setWorking(null);
  }

  const deployable=releasable.length;
  const buttonBase="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50";
  return <main className="sandbox-step-intro mx-auto grid max-w-7xl gap-5 pb-12">
    <Joyride 
      steps={tourSteps} 
      run={runTour} 
      continuous 
      showSkipButton 
      styles={{
        options: { primaryColor: '#1688a6', zIndex: 10000 }
      }} 
    />
    <section className="grid gap-5 overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_82%_12%,rgba(51,198,221,.42),transparent_26%),linear-gradient(115deg,#06182e,#0b4263)] px-6 py-7 text-white shadow-[0_18px_48px_rgba(7,19,38,.14)] sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end">
      <div><span className="or-type-label text-teal-300">DAILY RELAY</span><h1 className="or-type-page mt-3 max-w-2xl">One review. Routine work moves safely.</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-200">OmniRelay separates safe operational actions from cases that need a person—without patient-by-patient checking.</p></div>
      <aside className="min-w-44 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur"><b className="or-type-stat block">{deployable+automaticCare.length+automaticAppointments.length}</b><span className="mt-1 block text-sm text-slate-200">routine actions due</span><small className="mt-3 flex items-center gap-1.5 text-xs font-bold text-amber-200"><ShieldAlert size={14}/>{exceptions.length} held for review</small></aside>
    </section>
    {exceptions.length>0&&<section className="flex flex-col gap-4 rounded-3xl border border-rose-200 bg-rose-50/70 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-600 text-sm font-black text-white">!</span><div><span className="or-type-label text-rose-700">NEEDS ATTENTION</span><h2 className="or-type-card mt-1 text-slate-900">{exceptions.length} action{exceptions.length===1?"":"s"} waiting for review</h2><p className="mt-1 text-sm leading-6 text-slate-600">The most urgent items are first. Claim an item before opening the protected patient record.</p></div></div><Link className={`${buttonBase} shrink-0 bg-rose-600 text-white hover:bg-rose-700`} href="#priority-review-queue">Open review queue <ArrowUpRight size={15}/></Link></section>}
    <section className="grid gap-5 rounded-3xl border border-border bg-white p-5 shadow-[0_12px_36px_rgba(7,19,38,.06)] lg:grid-cols-[1fr_auto] lg:items-center"><div><span className="or-type-label text-primary">READY TO DEPLOY</span><h2 className="or-type-section mt-2">Today&apos;s patient action plan</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Consent, mobile number, timing, retry limits and approved workflows are checked again during deployment.</p></div><button className={`${buttonBase} bg-primary text-primary-foreground hover:bg-primary/90`} disabled={busy||deployable===0} onClick={deploy}><SendHorizontal size={16}/>{busy?"Deploying safely…":deployable?`Review & deploy ${deployable} actions`:"Routine actions already automated"}</button>{result&&<p className="flex items-center gap-2 text-sm font-medium text-emerald-700 lg:col-span-2"><CheckCircle2 size={16}/> {result.deployed_count} released · {result.automatic_count} automatic actions remain queued · {result.exception_count} exceptions retained</p>}{error&&<p className="text-sm font-medium text-destructive lg:col-span-2">{error}</p>}</section>
    {canManageNotifications&&<section className="flex flex-col gap-4 rounded-3xl border border-border bg-secondary/40 p-5 lg:flex-row lg:items-center lg:justify-between"><div><span className="text-xs font-black tracking-[.15em] text-primary">MOBILE ALERTS</span><h2 className="mt-2 text-xl font-semibold">Alert controls</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Run a patient-free device test, or archive only stale alerts. Neither action sends WhatsApp messages.</p></div><nav className="flex flex-wrap gap-2"><button className={`${buttonBase} border border-primary/20 bg-white text-primary hover:bg-primary/5`} onClick={testMobileAlert} disabled={working!==null}><BellRing size={16}/>{working==="mobile-alert-test"?"Sending test…":"Send test alert"}</button><button className={`${buttonBase} border border-border bg-white text-foreground hover:bg-muted`} onClick={archiveHistoricalAlerts} disabled={working!==null}><ClipboardCheck size={16}/>{working==="archive-historical-alerts"?"Archiving…":"Archive history"}</button></nav></section>}
    <section className="grid gap-4 md:grid-cols-3">{routine.map(item=><article className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm" key={item.label}><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.tone==="exception"?"bg-rose-50 text-rose-600":"bg-teal-50 text-teal-700"}`}>{item.tone==="exception"?<CircleAlert size={20}/>:<CheckCircle2 size={20}/>}</span><div className="min-w-0"><b className="block text-sm">{item.label}</b><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.detail}</span></div><strong className="or-type-stat ml-auto">{item.count}</strong></article>)}</section>
    <section className="flex flex-col gap-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"><div><b className="block text-sm text-slate-900">Deploy safe actions together</b><span className="mt-1 block text-sm text-slate-600">Only consented, due actions are included. Each exception below stays available for separate review.</span></div><button className={`${buttonBase} shrink-0 bg-primary text-primary-foreground hover:bg-primary/90`} disabled={busy||deployable===0} onClick={deploy}><SendHorizontal size={16}/>{busy?"Deploying safely…":deployable?`Deploy all safe actions (${deployable})`:"No safe actions ready"}</button></section>
    <section id="priority-review-queue" className="sandbox-step-queue scroll-mt-6 overflow-hidden rounded-3xl border border-border bg-white shadow-[0_12px_36px_rgba(7,19,38,.06)]"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div><span className="or-type-label text-primary">PRIORITIZED CLINIC QUEUE</span><h2 className="or-type-section mt-2">Approvals, waitlists and exceptions</h2></div><span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-bold text-rose-700">{exceptions.length} items</span></header>{notice&&<p className="m-5 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800" role="status">{notice}</p>}{error&&<p className="m-5 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-800" role="alert">{error}</p>}{exceptions.length===0?<div className="grid min-h-48 place-items-center p-8 text-center"><CheckCircle2 className="mb-3 text-emerald-600" size={32}/><b>No cases need manual review</b><span className="mt-1 text-sm text-muted-foreground">Routine actions can continue without clinic administration.</span></div>:<div className="divide-y divide-border">{exceptions.slice(0,30).map(item=>{const claimedByYou=item.assignment?.assigned_to===currentUserId;const claimedByOther=!!item.assignment?.assigned_to&&!claimedByYou;return <article className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start" key={`${item.type}-${item.id}`}><span className={`grid size-10 shrink-0 place-items-center rounded-xl font-black ${item.priority==="urgent"?"bg-rose-50 text-rose-600":"bg-amber-50 text-amber-700"}`}>{item.priority==="urgent"?"!!":"!"}</span><div className="min-w-0 flex-1"><b className="block text-sm">{item.name} <span className="font-normal text-muted-foreground">· {item.type}</span></b><span className="mt-1 block whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.detail}</span><small className="mt-2 flex items-center gap-1 text-xs font-medium text-muted-foreground"><UserRoundCheck size={13}/>{item.kind==="agent_draft"?"AI Generated Draft":claimedByYou?"Owned by you":claimedByOther?"Owned by another administrator":"Unassigned"}{item.assignment?.status==="reviewed"?" · review recorded":""}</small></div><nav className="flex flex-wrap gap-2 sm:justify-end">{item.kind==="agent_draft"?<><button className={`${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700`} type="button" onClick={()=>resolveDraft(item,"approve")} disabled={working===item.id}>{working===item.id?"Approving…":"Approve"}</button><button className={`sandbox-step-discuss ${buttonBase} border border-border bg-white text-blue-600 hover:bg-blue-50`} type="button" onClick={()=>resolveDraft(item,"edit")} disabled={working===item.id}>Discuss / Refine</button><button className={`${buttonBase} border border-border bg-white text-rose-600 hover:bg-rose-50`} type="button" onClick={()=>resolveDraft(item,"reject")} disabled={working===item.id}>Reject & Train</button></>:item.kind==="care_task"?<>{!claimedByYou&&!claimedByOther&&<button className={`${buttonBase} border border-border bg-white text-foreground`} type="button" onClick={()=>coordinate(item,"claim")} disabled={working===item.id}>{working===item.id?"Claiming…":"Claim follow-up"}</button>}{claimedByYou&&item.status==="open"&&<button className={`${buttonBase} border border-border bg-white text-foreground`} type="button" onClick={()=>updateTask(item,"in_progress")} disabled={working===item.id}>Start follow-up</button>}{claimedByYou&&<button className={`${buttonBase} bg-emerald-600 text-white`} type="button" onClick={()=>updateTask(item,"completed")} disabled={working===item.id}>{working===item.id?"Saving…":"Complete"}</button>}{claimedByYou&&<button className={`${buttonBase} border border-border bg-white text-foreground`} type="button" onClick={()=>coordinate(item,"release")} disabled={working===item.id}>Release</button>}<Link className={`${buttonBase} bg-primary text-primary-foreground`} href={item.href}>Open <ArrowUpRight size={15}/></Link></>:item.kind==="care_retry"||item.kind==="appointment_retry"?<button className={`${buttonBase} bg-primary text-primary-foreground`} type="button" onClick={()=>retry(item)} disabled={working===item.id}>{working===item.id?"Releasing…":"Review & retry"}</button>:<><button className={`${buttonBase} border border-border bg-white text-foreground`} type="button" onClick={()=>coordinate(item,item.assignment?.assigned_to===currentUserId?"review":"claim")} disabled={working===item.id||item.kind==="blocked"}>{item.assignment?.assigned_to===currentUserId?"Mark reviewed":"Claim"}</button><Link className={`${buttonBase} bg-primary text-primary-foreground`} href={item.href}>Open <ArrowUpRight size={15}/></Link></>}</nav></article>})}</div>}</section>
    <section className="overflow-hidden rounded-3xl border border-border bg-white"><header className="flex items-center justify-between gap-3 border-b border-border p-5"><div><span className="text-xs font-black tracking-[.15em] text-primary">AUDIT TRAIL</span><h2 className="mt-2 text-xl font-semibold">Recent deployments</h2></div><Link className="inline-flex items-center gap-1 text-sm font-bold text-primary" href="/app/activity">Full activity log <ArrowUpRight size={15}/></Link></header>{deployments.length===0?<p className="p-5 text-sm text-muted-foreground">No one-click deployment has been run yet.</p>:<div className="divide-y divide-border">{deployments.map(d=><article className="flex items-center justify-between gap-3 p-4" key={d.id}><div><b className="block text-sm"><Clock3 className="mr-1 inline size-4 text-primary"/>{when(d.created_at)}</b><span className="mt-1 block text-xs text-muted-foreground">{d.deployed_count} released · {d.automatic_count} automatic · {d.exception_count} retained</span></div><em className="rounded-full bg-muted px-3 py-1 text-xs font-bold not-italic capitalize text-muted-foreground">{d.status}</em></article>)}</div>}</section>
  </main>;
}
