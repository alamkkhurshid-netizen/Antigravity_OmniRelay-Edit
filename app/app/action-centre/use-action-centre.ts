import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CareRun, AppointmentRun, Task, Deployment, BookingRequest, WaitlistItem,
  Disruption, EmergencyRecipient, Assignment, ReadinessCheck, PilotControl, AiDraft, ExceptionItem
} from "./types";

const when = (value:string) => new Intl.DateTimeFormat("en-IN", { day:"numeric", month:"short", hour:"numeric", minute:"2-digit", timeZone:"Asia/Kolkata" }).format(new Date(value));
const clinicDay = (value:string) => new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Kolkata" }).format(new Date(value));

export function useActionCentre({
  careRuns, appointmentRuns, tasks, deployments, bookingRequests, waitlist, disruptions, emergencyRecipients,
  assignments, readinessChecks, pilotControl, aiDrafts, currentUserId, nowIso
}: {
  careRuns:CareRun[]; appointmentRuns:AppointmentRun[]; tasks:Task[]; deployments:Deployment[];
  bookingRequests:BookingRequest[]; waitlist:WaitlistItem[]; disruptions:Disruption[]; emergencyRecipients:EmergencyRecipient[];
  assignments:Assignment[]; readinessChecks:ReadinessCheck[]; pilotControl:PilotControl|null; aiDrafts:AiDraft[];
  currentUserId:string; nowIso:string;
}) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [working,setWorking]=useState<string|null>(null);
  const [result,setResult]=useState<{deployed_count:number;automatic_count:number;exception_count:number}|null>(null);
  
  const isDemo = aiDrafts.some(d => (d.draft_payload as any)?.metadata?.demo === true);
  const [runTour, setRunTour] = useState(false);
  
  useEffect(() => {
    if (isDemo) setRunTour(true);
  }, [isDemo]);

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
  
  const exceptions:ExceptionItem[]=[
    ...(pilotControlException?[pilotControlException]:[]),
    ...readinessChecks.map(item=>withOwner({id:item.id,kind:"blocked" as const,type:"Clinic launch gate blocked",name:item.check_key.replaceAll("_"," "),detail:item.notes??"Owner evidence is required before controlled clinic launch.",priority:"urgent",rank:98,href:"/app/readiness"})),
    ...aiDrafts.map(r=>withOwner({id:r.id,kind:"agent_draft" as const,type:`AI Draft: ${r.proposed_action}`,name:`Agent: ${r.agent_role}`,detail:typeof r.draft_payload?.text === 'string' ? r.draft_payload.text : 'Review required.',priority:"urgent",rank:105,href:"#",draft_payload:r.draft_payload})),
    ...bookingRequests.map(r=>withOwner({id:r.id,kind:"booking_approval" as const,type:"Booking approval required",name:r.patient_name,detail:`${r.service?.name??"Appointment"} · ${r.location?.name??"Clinic"} · ${r.resource?.name??"Provider"} · ${when(r.starts_at)}`,priority:"urgent",rank:100,href:"/app/booking-concierge#booking-requests"})),
    ...disruptions.map(r=>withOwner({id:r.id,kind:"schedule_disruption" as const,type:`${r.exception_type.replaceAll("_"," ")} disruption`,name:r.resource?.name??"Clinic schedule",detail:`${r.location?.name??"All locations"} · ${when(r.starts_at)} · ${r.reason}`,priority:"urgent",rank:95,href:"/app/appointments"})),
    ...emergencyRecipients.map(r=>withOwner({id:r.id,kind:"blocked" as const,type:"Emergency notice needs manual contact",name:r.patient?.full_name??"Patient",detail:r.failure_reason??"WhatsApp emergency notice was not delivered. Call the patient and record the outcome.",priority:"urgent",rank:94,href:"/app/campaigns"})),
    ...waitlist.map(r=>withOwner({id:r.id,kind:"waitlist" as const,type:"Waitlist follow-up",name:r.patient_name,detail:`${r.service?.name??"Appointment"} · ${r.location?.name??"Clinic"} · preferred ${r.preferred_date}`,priority:r.status==="offered"?"urgent":"high",rank:r.status==="offered"?90:70,href:"/app/booking-concierge#waitlist"})),
    ...careExceptions.map(r=>withOwner({id:r.id,kind:r.status==="failed"?"care_retry" as const:"blocked" as const,type:r.status==="failed"?"Care reminder failed":"Reminder blocked",name:r.patient?.full_name??"Patient",detail:r.failure_reason??(!r.patient?.care_communications_consent?"Care communication consent is missing.":"Patient mobile number is missing."),priority:"high",rank:65,href:r.status==="failed"?"/app/operations":"/app/automations"})),
    ...appointmentExceptions.map(r=>withOwner({id:r.id,kind:"appointment_retry" as const,type:"Appointment message failed",name:r.appointment?.customer_name??"Patient",detail:r.failure_reason??"Delivery requires review.",priority:"high",rank:60,href:"/app/operations"})),
    ...taskExceptions.map(t=>{const overdue=!!t.due_at&&new Date(t.due_at).getTime()<=now;return withOwner({id:t.id,kind:"care_task" as const,type:overdue?`Overdue follow-up · ${t.title}`:t.title,name:t.patient?.full_name??"Patient",detail:`${overdue&&t.due_at?`Due ${when(t.due_at)} · `:""}${t.details??"Staff review required."}`,priority:t.priority,rank:overdue?88:t.priority==="urgent"?85:t.priority==="high"?55:40,href:"/app/contacts",status:t.status})})
  ].sort((a,b)=>b.rank-a.rank);

  const routine=useMemo(()=>[
    {label:"Medication and care reminders",count:releasable.length+automaticCare.length,detail:`${releasable.length} ready for release · ${automaticCare.length} already automatic`,tone:"care"},
    {label:"Appointment lifecycle messages",count:automaticAppointments.length,detail:"Confirmation, reminder, reschedule and follow-up events due now",tone:"appointment"},
    {label:"Human review retained",count:exceptions.length,detail:"Clinical, consent or delivery exceptions are never batch-sent",tone:"exception"},
  ],[releasable.length,automaticCare.length,automaticAppointments.length,exceptions.length]);

  const deployable=releasable.length;

  async function deploy(){
    if(deployable===0)return;
    if(!window.confirm(`Deploy ${deployable} safe action${deployable===1?"":"s"} now? Only consented, due WhatsApp care actions will be sent. Approvals, failed messages and clinic holds will remain for individual review.`))return;
    setBusy(true);setError("");setResult(null);
    const response=await fetch("/api/action-centre",{method:"POST"});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)setError(body.error??"Routine actions could not be deployed.");
    else{setResult(body.deployment);router.refresh()}
    setBusy(false);
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

  return {
    busy, error, notice, working, result, runTour,
    deployable, automaticCare, automaticAppointments, exceptions, routine,
    deploy, updateTask, retry, coordinate, testMobileAlert, archiveHistoricalAlerts, resolveDraft
  };
}
