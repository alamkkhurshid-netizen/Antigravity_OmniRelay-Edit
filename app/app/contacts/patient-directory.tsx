"use client";

import { useMemo, useState } from "react";
import {
  MedicineLookup,
  type MedicineCatalogueSelection,
} from "./medicine-lookup";
import { getPatientJourneyStatus } from "./patient-journey";
import { Users, Activity, ClockAlert, ClipboardCheck, CalendarDays, ShieldCheck } from "lucide-react";

export type Patient = {
  id:string;full_name:string;phone:string|null;email:string|null;age:number|null;
  date_of_birth:string|null;primary_contact_phone:string|null;identity_status:"unverified"|"verified"|"staff_verified";
  health_concern:string|null;locality:string|null;pincode:string|null;patient_summary:string|null;
  care_communications_consent:boolean;marketing_consent:boolean;first_seen_at:string;last_seen_at:string;
  avatar_storage_path:string|null;avatar_updated_at:string|null;avatar_url:string|null;
};
export type PatientGuardianLink = {
  id:string;patient_id:string;guardian_name:string;guardian_phone:string;
  relationship:"self"|"child"|"parent"|"spouse"|"relative"|"other";
  verification_status:"unverified"|"otp_verified"|"staff_verified";verified_at:string|null;
  created_at:string;updated_at:string;
};
export type PatientAppointment = {
  id:string;patient_id:string|null;starts_at:string;status:string;source:string;notes:string|null;
  health_concern:string|null;patient_summary:string|null;
  location:{name:string}|null;service:{name:string}|null;resource:{name:string}|null;
};
export type PatientEncounter = {
  id:string;patient_id:string;appointment_id:string|null;encounter_type:string;occurred_at:string;
  diagnosis:string|null;clinical_note:string;treatment_plan:string|null;follow_up_at:string|null;
  follow_up_status:string;created_at:string;
};
export type PrescriptionItem = {
  id:string;prescription_id:string;medicine_name:string;dosage:string|null;frequency:string;
  duration:string|null;instructions:string|null;sort_order:number;
};
export type Prescription = {
  id:string;patient_id:string;encounter_id:string|null;appointment_id:string|null;
  prescription_number:string;issued_at:string;status:string;diagnosis:string|null;advice:string|null;
  tests_requested:string|null;follow_up_at:string|null;version:number;items:PrescriptionItem[];
};
export type PatientDocument = {
  id:string;patient_id:string;encounter_id:string|null;appointment_id:string|null;
  document_type:string;title:string;mime_type:string;file_size_bytes:number;created_at:string;
};
export type PatientConsentEvent = {
  id:string;patient_id:string;consent_type:"care_communications"|"marketing";
  previous_status:boolean|null;new_status:boolean;source:string;captured_at:string;note:string|null;
};
export type PatientCareTask = {
  id:string;patient_id:string;encounter_id:string|null;appointment_id:string|null;care_plan_id:string|null;
  task_type:"follow_up"|"call"|"test_review"|"document"|"care"|"other";
  title:string;details:string|null;due_at:string|null;priority:"low"|"normal"|"high"|"urgent";
  status:"open"|"in_progress"|"completed"|"cancelled";assigned_to:string|null;
  created_by:string;completed_by:string|null;completed_at:string|null;created_at:string;updated_at:string;
};
export type PatientCarePlan = {
  id:string;patient_id:string;encounter_id:string|null;
  plan_type:"chronic_care"|"post_visit"|"preventive"|"recovery"|"other";
  title:string;goal:string|null;instructions:string|null;
  status:"draft"|"active"|"paused"|"completed"|"cancelled";
  starts_on:string;target_date:string|null;next_review_at:string|null;assigned_to:string|null;
  created_by:string;completed_by:string|null;completed_at:string|null;created_at:string;updated_at:string;
};
export type CarePlanReminder = {
  id:string;patient_id:string;care_plan_id:string;status:"active"|"paused"|"completed"|"cancelled";
  next_run_at:string;last_run_at:string|null;
};
export type ClinicStaff = { user_id:string|null; name:string; extra:{clinic_role?:string}|null };
type MedicineDraft = {
  medicineName:string;dosage:string;frequency:string;duration:string;instructions:string;
  catalogueSelection:MedicineCatalogueSelection|null;
  reminderEnabled:boolean;reminderTimes:string;reminderDays:number;
};
const emptyMedicine=():MedicineDraft=>({
  medicineName:"",dosage:"",frequency:"",duration:"",instructions:"",
  catalogueSelection:null,
  reminderEnabled:false,reminderTimes:"09:00",reminderDays:7,
});

const activeStatuses=["pending","payment_pending","confirmed","rescheduling_required"];
const carePlanTemplates = {
  custom: { label: "Custom", planType: "post_visit", title: "", goal: "", instructions: "" },
  post_visit: { label: "Post-visit review", planType: "post_visit", title: "Post-visit care review", goal: "Confirm the doctor-approved next step and review date.", instructions: "Assign a clinic owner, record the planned review, and document any completed follow-up." },
  recovery: { label: "Recovery follow-up", planType: "recovery", title: "Recovery follow-up plan", goal: "Coordinate the doctor-approved recovery review.", instructions: "Record the responsible owner and review date. Escalate clinical questions to the treating clinician." },
  chronic: { label: "Ongoing review", planType: "chronic_care", title: "Ongoing care review", goal: "Keep the doctor-approved review schedule and clinic ownership clear.", instructions: "Set the next review, assign the clinic owner, and capture the outcome after the review." },
} as const;
function dateLabel(value:string) {
  return new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"Asia/Kolkata"}).format(new Date(value));
}

export function PatientDirectory({patients,appointments,encounters,prescriptions,documents,consentEvents,tasks,carePlans,carePlanReminders,staff,guardianLinks,canManageFamily,nowIso}:{patients:Patient[];appointments:PatientAppointment[];encounters:PatientEncounter[];prescriptions:Prescription[];documents:PatientDocument[];consentEvents:PatientConsentEvent[];tasks:PatientCareTask[];carePlans:PatientCarePlan[];carePlanReminders:CarePlanReminder[];staff:ClinicStaff[];guardianLinks:PatientGuardianLink[];canManageFamily:boolean;nowIso:string}) {
  const [patientRows,setPatientRows]=useState(patients);
  const [encounterRows,setEncounterRows]=useState(encounters);
  const [prescriptionRows,setPrescriptionRows]=useState(prescriptions);
  const [documentRows,setDocumentRows]=useState(documents);
  const [taskRows,setTaskRows]=useState(tasks);
  const [carePlanRows,setCarePlanRows]=useState(carePlans);
  const [carePlanReminderRows,setCarePlanReminderRows]=useState(carePlanReminders);
  const [guardianRows,setGuardianRows]=useState(guardianLinks);
  const [medicines,setMedicines]=useState<MedicineDraft[]>([emptyMedicine()]);
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<"all"|"needs_action"|"follow_up"|"tasks"|"overdue"|"upcoming">("all");
  const [activeId,setActiveId]=useState<string|null>(null);
  const [editing,setEditing]=useState(false);
  const [recording,setRecording]=useState(false);
  const [prescribing,setPrescribing]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [creatingTask,setCreatingTask]=useState(false);
  const [creatingCarePlan,setCreatingCarePlan]=useState(false);
  const [carePlanTemplate,setCarePlanTemplate]=useState<keyof typeof carePlanTemplates>("custom");
  const [managingFamily,setManagingFamily]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [issuedPrescriptionId,setIssuedPrescriptionId]=useState<string|null>(null);
  const [encounterFollowUpAt,setEncounterFollowUpAt]=useState("");
  const now=new Date(nowIso).getTime();
  const patientAppointments=useMemo(()=>{
    const grouped=new Map<string,PatientAppointment[]>();
    appointments.forEach((item)=>{if(!item.patient_id)return;grouped.set(item.patient_id,[...(grouped.get(item.patient_id)??[]),item])});
    return grouped;
  },[appointments]);
  const patientEncounters=useMemo(()=>{
    const grouped=new Map<string,PatientEncounter[]>();
    encounterRows.forEach((item)=>grouped.set(item.patient_id,[...(grouped.get(item.patient_id)??[]),item]));
    return grouped;
  },[encounterRows]);
  const patientPrescriptions=useMemo(()=>{
    const grouped=new Map<string,Prescription[]>();
    prescriptionRows.forEach((item)=>grouped.set(item.patient_id,[...(grouped.get(item.patient_id)??[]),item]));
    return grouped;
  },[prescriptionRows]);
  const patientDocuments=useMemo(()=>{
    const grouped=new Map<string,PatientDocument[]>();
    documentRows.forEach((item)=>grouped.set(item.patient_id,[...(grouped.get(item.patient_id)??[]),item]));
    return grouped;
  },[documentRows]);
  const patientConsentEvents=useMemo(()=>{
    const grouped=new Map<string,PatientConsentEvent[]>();
    consentEvents.forEach((item)=>grouped.set(item.patient_id,[...(grouped.get(item.patient_id)??[]),item]));
    return grouped;
  },[consentEvents]);
  const patientTasks=useMemo(()=>{
    const grouped=new Map<string,PatientCareTask[]>();
    taskRows.forEach((item)=>grouped.set(item.patient_id,[...(grouped.get(item.patient_id)??[]),item]));
    return grouped;
  },[taskRows]);
  const patientCarePlans=useMemo(()=>{
    const grouped=new Map<string,PatientCarePlan[]>();
    carePlanRows.forEach((item)=>grouped.set(item.patient_id,[...(grouped.get(item.patient_id)??[]),item]));
    return grouped;
  },[carePlanRows]);
  const patientJourneys=useMemo(()=>new Map(patientRows.map((patient)=>{
    const patientEncounterRows=patientEncounters.get(patient.id)??[];
    const patientTaskRows=patientTasks.get(patient.id)??[];
    return [patient.id,getPatientJourneyStatus({
      hasPhone:Boolean(patient.phone),hasAge:patient.age!=null,hasHealthConcern:Boolean(patient.health_concern),
      hasLocation:Boolean(patient.locality),hasPincode:Boolean(patient.pincode),careConsent:patient.care_communications_consent,
      encounterCount:patientEncounterRows.length,prescriptionCount:(patientPrescriptions.get(patient.id)??[]).length,
      documentCount:(patientDocuments.get(patient.id)??[]).length,
      activeFollowUpCount:patientEncounterRows.filter((item)=>item.follow_up_at&&["scheduled","due"].includes(item.follow_up_status)).length,
      openTaskCount:patientTaskRows.filter((item)=>["open","in_progress"].includes(item.status)).length,
      activeCarePlanCount:(patientCarePlans.get(patient.id)??[]).filter((item)=>item.status==="active").length,
    })];
  })),[patientRows,patientEncounters,patientPrescriptions,patientDocuments,patientTasks,patientCarePlans]);
  const rows=useMemo(()=>patientRows.filter((patient)=>{
    const haystack=[patient.full_name,patient.phone,patient.email,patient.health_concern,patient.locality,patient.pincode].filter(Boolean).join(" ").toLowerCase();
    const matchesQuery=haystack.includes(query.trim().toLowerCase());
    const visits=patientAppointments.get(patient.id)??[];
    const notes=patientEncounters.get(patient.id)??[];
    const careTasks=patientTasks.get(patient.id)??[];
    const matchesFilter=filter==="all"
      ||(filter==="needs_action"&&!patientJourneys.get(patient.id)?.ready)
      ||(filter==="upcoming"&&visits.some((item)=>activeStatuses.includes(item.status)&&new Date(item.starts_at).getTime()>now))
      ||(filter==="follow_up"&&notes.some((item)=>item.follow_up_at&&["scheduled","due"].includes(item.follow_up_status)))
      ||(filter==="tasks"&&careTasks.some((item)=>["open","in_progress"].includes(item.status)))
      ||(filter==="overdue"&&(notes.some((item)=>item.follow_up_at&&new Date(item.follow_up_at).getTime()<now&&["scheduled","due"].includes(item.follow_up_status))||careTasks.some((item)=>item.due_at&&new Date(item.due_at).getTime()<now&&["open","in_progress"].includes(item.status))));
    return matchesQuery&&matchesFilter;
  }),[patientRows,query,filter,patientAppointments,patientEncounters,patientTasks,patientJourneys,now]);
  const active=patientRows.find((patient)=>patient.id===activeId)??null;
  const timeline=active?[...(patientAppointments.get(active.id)??[])].sort((a,b)=>new Date(b.starts_at).getTime()-new Date(a.starts_at).getTime()):[];
  const clinicalTimeline=active?[...(patientEncounters.get(active.id)??[])].sort((a,b)=>new Date(b.occurred_at).getTime()-new Date(a.occurred_at).getTime()):[];
  const activePrescriptions=active?[...(patientPrescriptions.get(active.id)??[])].sort((a,b)=>new Date(b.issued_at).getTime()-new Date(a.issued_at).getTime()):[];
  const activeDocuments=active?[...(patientDocuments.get(active.id)??[])].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()):[];
  const activeConsentEvents=active?[...(patientConsentEvents.get(active.id)??[])].sort((a,b)=>new Date(b.captured_at).getTime()-new Date(a.captured_at).getTime()):[];
  const activeTasks=active?[...(patientTasks.get(active.id)??[])].filter((item)=>["open","in_progress"].includes(item.status)).sort((a,b)=>(a.due_at?new Date(a.due_at).getTime():Number.MAX_SAFE_INTEGER)-(b.due_at?new Date(b.due_at).getTime():Number.MAX_SAFE_INTEGER)):[];
  const activeCarePlans=active?[...(patientCarePlans.get(active.id)??[])].filter((item)=>["active","paused"].includes(item.status)).sort((a,b)=>(a.next_review_at?new Date(a.next_review_at).getTime():Number.MAX_SAFE_INTEGER)-(b.next_review_at?new Date(b.next_review_at).getTime():Number.MAX_SAFE_INTEGER)):[];
  const activeGuardians=active?guardianRows.filter((item)=>item.patient_id===active.id):[];
  const activeFollowUps=clinicalTimeline.filter((item)=>item.follow_up_at&&["scheduled","due"].includes(item.follow_up_status)).sort((a,b)=>new Date(a.follow_up_at!).getTime()-new Date(b.follow_up_at!).getTime());
  const visitedCount=patientRows.filter((patient)=>(patientAppointments.get(patient.id)??[]).some((item)=>new Date(item.starts_at).getTime()<now&&item.status!=="cancelled")).length;
  const followUps=appointments.filter((item)=>activeStatuses.includes(item.status)&&new Date(item.starts_at).getTime()>now).length;
  const consented=patientRows.filter((patient)=>patient.marketing_consent).length;
  const followUpPatients=patientRows.filter((patient)=>(patientEncounters.get(patient.id)??[]).some((item)=>item.follow_up_at&&["scheduled","due"].includes(item.follow_up_status))).length;
  const overduePatients=patientRows.filter((patient)=>(patientEncounters.get(patient.id)??[]).some((item)=>item.follow_up_at&&new Date(item.follow_up_at).getTime()<now&&["scheduled","due"].includes(item.follow_up_status))).length;
  const openTaskCount=taskRows.filter((item)=>["open","in_progress"].includes(item.status)).length;
  const overdueTaskCount=taskRows.filter((item)=>item.due_at&&new Date(item.due_at).getTime()<now&&["open","in_progress"].includes(item.status)).length;
  const readyPatients=patientRows.filter((patient)=>patientJourneys.get(patient.id)?.ready).length;
  const documentedVisits=patientRows.filter((patient)=>(patientEncounters.get(patient.id)??[]).length>0).length;
  const activatedCarePlans=patientRows.filter((patient)=>(patientCarePlans.get(patient.id)??[]).some((item)=>item.status==="active")).length;
  const activeJourney=active?patientJourneys.get(active.id)??null:null;

  async function saveProfile(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!active||saving)return;
    setSaving(true);setError("");setNotice("");
    const data=new FormData(event.currentTarget);
    const response=await fetch("/api/contacts/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      patientId:active.id,contactAddress:active.phone,fullName:data.get("fullName"),email:data.get("email"),
      age:data.get("age")?Number(data.get("age")):null,healthConcern:data.get("healthConcern"),
      locality:data.get("locality"),pincode:data.get("pincode"),patientSummary:data.get("patientSummary"),
      careConsent:data.get("careConsent")==="on",marketingConsent:data.get("marketingConsent")==="on",
    })});
    const result=await response.json().catch(()=>({})) as {patient?:Patient;error?:string};
    if(!response.ok||!result.patient)setError(result.error??"Profile could not be saved.");
    else{setPatientRows((current)=>current.map((item)=>item.id===result.patient!.id?{...result.patient!,avatar_url:item.avatar_url}:item));setEditing(false)}
    setSaving(false);
  }

  async function saveEncounter(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!active||saving)return;
    setSaving(true);setError("");setIssuedPrescriptionId(null);
    const data=new FormData(event.currentTarget);
    const response=await fetch("/api/patients/encounters",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      patientId:active.id,appointmentId:data.get("appointmentId")||null,encounterType:data.get("encounterType"),
      occurredAt:data.get("occurredAt"),diagnosis:data.get("diagnosis"),clinicalNote:data.get("clinicalNote"),
      treatmentPlan:data.get("treatmentPlan"),followUpAt:data.get("followUpAt")||null,
    })});
    const result=await response.json().catch(()=>({})) as {encounter?:PatientEncounter;reminderCreated?:boolean;warning?:string|null;error?:string};
    if(!response.ok||!result.encounter)setError(result.error??"Clinical record could not be saved.");
    else{
      setEncounterRows((current)=>[result.encounter!,...current]);setRecording(false);setEncounterFollowUpAt("");
      setNotice(result.warning??(result.reminderCreated?"Visit saved and the follow-up reminder was scheduled automatically.":"Clinical visit saved."));
    }
    setSaving(false);
  }

  function chooseFollowUpDays(days:number) {
    const date=new Date();
    date.setDate(date.getDate()+days);
    date.setHours(10,0,0,0);
    const local=new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);
    setEncounterFollowUpAt(local);
  }

  async function updateFollowUp(id:string,status:"scheduled"|"completed"|"cancelled",followUpAt?:string) {
    if(saving)return;
    setSaving(true);setError("");setNotice("");
    const response=await fetch("/api/patients/encounters",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,followUpStatus:status,followUpAt:followUpAt||null})});
    const result=await response.json().catch(()=>({})) as {encounter?:PatientEncounter;warning?:string|null;error?:string};
    if(!response.ok||!result.encounter)setError(result.error??"Follow-up could not be updated.");
    else{
      setEncounterRows((current)=>current.map((item)=>item.id===id?result.encounter!:item));
      setNotice(result.warning??(status==="completed"?"Follow-up completed and its reminder was closed.":status==="cancelled"?"Follow-up and its reminder were cancelled.":"Follow-up and its reminder were rescheduled."));
    }
    setSaving(false);
  }

  function updateMedicine<K extends keyof MedicineDraft>(index:number,key:K,value:MedicineDraft[K]) {
    setMedicines((current)=>current.map((item,itemIndex)=>itemIndex===index?{...item,[key]:value}:item));
  }

  async function issuePrescription(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!active||saving)return;
    setSaving(true);setError("");setIssuedPrescriptionId(null);
    const data=new FormData(event.currentTarget);
    const encounterId=String(data.get("encounterId")||"");
    const linkedEncounter=clinicalTimeline.find((item)=>item.id===encounterId);
    const response=await fetch("/api/patients/prescriptions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      patientId:active.id,encounterId:encounterId||null,appointmentId:linkedEncounter?.appointment_id??null,
      diagnosis:data.get("diagnosis"),advice:data.get("advice"),testsRequested:data.get("testsRequested"),
      followUpAt:data.get("followUpAt")||null,medicines,
    })});
    const result=await response.json().catch(()=>({})) as {prescription?:Prescription;reminderCount?:number;warning?:string|null;error?:string};
    if(!response.ok||!result.prescription)setError(result.error??"Prescription could not be issued.");
    else{
      setPrescriptionRows((current)=>[result.prescription!,...current]);setPrescribing(false);setMedicines([emptyMedicine()]);setIssuedPrescriptionId(result.prescription.id);
      setNotice(result.warning??(result.reminderCount?`Prescription issued with ${result.reminderCount} medication reminder schedule${result.reminderCount===1?"":"s"}.`:"Prescription issued."));
    }
    setSaving(false);
  }

  async function uploadDocument(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!active||saving)return;
    setSaving(true);setError("");
    const data=new FormData(event.currentTarget);
    data.set("patientId",active.id);
    const response=await fetch("/api/patients/documents",{method:"POST",body:data});
    const result=await response.json().catch(()=>({})) as {document?:PatientDocument;error?:string};
    if(!response.ok||!result.document)setError(result.error??"Document could not be uploaded.");
    else{setDocumentRows((current)=>[result.document!,...current]);setUploading(false)}
    setSaving(false);
  }

  async function uploadAvatar(event:React.ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];
    event.target.value="";
    if(!active||!file||saving)return;
    setSaving(true);setError("");setNotice("");
    const data=new FormData();data.set("patientId",active.id);data.set("file",file);
    const response=await fetch("/api/contacts/avatar",{method:"POST",body:data});
    const result=await response.json().catch(()=>({})) as {avatarStoragePath?:string;avatarUpdatedAt?:string;avatarUrl?:string|null;error?:string};
    if(!response.ok||!result.avatarStoragePath)setError(result.error??"Patient photo could not be uploaded.");
    else{
      setPatientRows((current)=>current.map((item)=>item.id===active.id?{...item,avatar_storage_path:result.avatarStoragePath!,avatar_updated_at:result.avatarUpdatedAt??null,avatar_url:result.avatarUrl??null}:item));
      setNotice("Patient photo updated securely.");
    }
    setSaving(false);
  }

  async function removeAvatar() {
    if(!active||!active.avatar_storage_path||saving)return;
    setSaving(true);setError("");setNotice("");
    const response=await fetch("/api/contacts/avatar",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({patientId:active.id})});
    const result=await response.json().catch(()=>({})) as {ok?:boolean;error?:string};
    if(!response.ok||!result.ok)setError(result.error??"Patient photo could not be removed.");
    else{
      setPatientRows((current)=>current.map((item)=>item.id===active.id?{...item,avatar_storage_path:null,avatar_updated_at:null,avatar_url:null}:item));
      setNotice("Patient photo removed.");
    }
    setSaving(false);
  }

  async function saveTask(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!active||saving)return;
    setSaving(true);setError("");setNotice("");
    const data=new FormData(event.currentTarget);
    const response=await fetch("/api/patients/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      patientId:active.id,taskType:data.get("taskType"),title:data.get("title"),details:data.get("details"),
      dueAt:data.get("dueAt")||null,priority:data.get("priority"),assignedTo:data.get("assignedTo")||null,
    })});
    const result=await response.json().catch(()=>({})) as {task?:PatientCareTask;error?:string};
    if(!response.ok||!result.task)setError(result.error??"Care task could not be created.");
    else{setTaskRows((current)=>[result.task!,...current]);setCreatingTask(false);setNotice("Care task added to the clinic queue.")}
    setSaving(false);
  }

  async function updateTask(id:string,status:PatientCareTask["status"]) {
    if(saving)return;
    setSaving(true);setError("");setNotice("");
    const response=await fetch("/api/patients/tasks",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});
    const result=await response.json().catch(()=>({})) as {task?:PatientCareTask;error?:string};
    if(!response.ok||!result.task)setError(result.error??"Care task could not be updated.");
    else{setTaskRows((current)=>current.map((item)=>item.id===id?result.task!:item));setNotice(status==="completed"?"Care task completed.":status==="cancelled"?"Care task cancelled.":"Care task started.")}
    setSaving(false);
  }

  async function saveCarePlan(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!active||saving||!canManageFamily)return;
    setSaving(true);setError("");setNotice("");
    const data=new FormData(event.currentTarget);
    const response=await fetch("/api/patients/care-plans",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      patientId:active.id,encounterId:data.get("encounterId")||null,planType:data.get("planType"),
      title:data.get("title"),goal:data.get("goal"),instructions:data.get("instructions"),
      startsOn:data.get("startsOn"),targetDate:data.get("targetDate")||null,
      nextReviewAt:data.get("nextReviewAt")||null,assignedTo:data.get("assignedTo")||null,
      schedulePatientReminder:data.get("schedulePatientReminder")==="on",
    })});
    const result=await response.json().catch(()=>({})) as {plan?:PatientCarePlan;reviewTask?:PatientCareTask|null;patientReminder?:CarePlanReminder|null;error?:string};
    if(!response.ok||!result.plan)setError(result.error??"Care plan could not be created.");
    else{setCarePlanRows((current)=>[result.plan!,...current]);if(result.reviewTask)setTaskRows((current)=>[result.reviewTask!,...current.filter((item)=>item.id!==result.reviewTask!.id)]);if(result.patientReminder)setCarePlanReminderRows((current)=>[result.patientReminder!,...current]);setCreatingCarePlan(false);setNotice(result.patientReminder?"Care plan activated; staff review and consent-controlled WhatsApp follow-up are scheduled.":result.reviewTask?"Care plan activated and its review task added to the clinic queue.":"Care plan activated for this patient.");}
    setSaving(false);
  }

  async function updateCarePlan(id:string,status:PatientCarePlan["status"]) {
    if(saving||!canManageFamily)return;
    setSaving(true);setError("");setNotice("");
    const response=await fetch("/api/patients/care-plans",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});
    const result=await response.json().catch(()=>({})) as {plan?:PatientCarePlan;reviewTask?:PatientCareTask|null;error?:string};
    if(!response.ok||!result.plan)setError(result.error??"Care plan could not be updated.");
    else{setCarePlanRows((current)=>current.map((item)=>item.id===id?result.plan!:item));setCarePlanReminderRows((current)=>current.map((item)=>item.care_plan_id===id?{...item,status:status==="active"?"active":status as CarePlanReminder["status"]}:item));if(result.reviewTask)setTaskRows((current)=>current.map((item)=>item.id===result.reviewTask!.id?result.reviewTask!:item));setNotice(status==="completed"?"Care plan, review task and patient follow-up completed.":status==="paused"?"Care plan paused; staff and patient follow-ups are paused.":status==="cancelled"?"Care plan, review task and patient follow-up cancelled.":"Care plan, review task and patient follow-up reactivated.");}
    setSaving(false);
  }

  async function saveGuardian(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!active||saving||!canManageFamily)return;
    setSaving(true);setError("");setNotice("");
    const data=new FormData(event.currentTarget);
    const response=await fetch("/api/patients/guardians",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      patientId:active.id,guardianName:data.get("guardianName"),guardianPhone:data.get("guardianPhone"),
      relationship:data.get("relationship"),staffVerified:data.get("staffVerified")==="on",
    })});
    const result=await response.json().catch(()=>({})) as {guardian?:PatientGuardianLink;error?:string};
    if(!response.ok||!result.guardian)setError(result.error??"Booking contact could not be saved.");
    else{setGuardianRows((current)=>[...current.filter((item)=>item.id!==result.guardian!.id),result.guardian!]);setManagingFamily(false);setNotice("Household booking contact saved.");}
    setSaving(false);
  }

  async function removeGuardian(id:string) {
    if(saving||!canManageFamily||!confirm("Remove this booking contact from the patient?"))return;
    setSaving(true);setError("");setNotice("");
    const response=await fetch(`/api/patients/guardians?id=${encodeURIComponent(id)}`,{method:"DELETE"});
    const result=await response.json().catch(()=>({})) as {deleted?:boolean;error?:string};
    if(!response.ok||!result.deleted)setError(result.error??"Booking contact could not be removed.");
    else{setGuardianRows((current)=>current.filter((item)=>item.id!==id));setNotice("Household booking contact removed.");}
    setSaving(false);
  }

  function openMode(mode:"record"|"edit"|"prescribe"|"upload"|"task"|"care_plan"|"family"|"none") {
    setRecording(mode==="record");setEditing(mode==="edit");setPrescribing(mode==="prescribe");setUploading(mode==="upload");setCreatingTask(mode==="task");setCreatingCarePlan(mode==="care_plan");if(mode==="care_plan")setCarePlanTemplate("custom");setManagingFamily(mode==="family");setError("");setNotice("");setIssuedPrescriptionId(null);
  }

  return <main className="mx-auto grid max-w-[1400px] gap-6 pb-20 pt-6">
    {/* 1. Hero Section - Refined Glassmorphism */}
    <section className="relative overflow-hidden rounded-[28px] bg-[#021021] px-8 py-10 text-white shadow-2xl sm:px-12 xl:grid xl:grid-cols-[1fr_minmax(320px,.45fr)] xl:items-end xl:gap-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(38,187,222,0.25),transparent_40%),radial-gradient(circle_at_0%_100%,rgba(51,198,221,0.15),transparent_40%)]" />
      <div className="absolute -left-12 -top-12 h-64 w-64 rounded-full bg-teal-500/20 blur-3xl" />
      <div className="absolute -bottom-12 -right-12 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
      
      <div className="relative z-10">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-teal-300 backdrop-blur-sm">PATIENT CRM</span>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-white via-teal-50 to-teal-100">Every patient, every visit, <br className="hidden sm:block"/>one trusted timeline.</h1>
        <p className="mt-4 max-w-2xl text-lg font-medium leading-relaxed text-slate-300">Search contact details, review booking history and understand consent before any future communication.</p>
      </div>
      <div className="relative z-10 mt-8 xl:mt-0">
        <label className="flex h-14 items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-5 text-white shadow-inner backdrop-blur-md transition-all focus-within:border-teal-400/50 focus-within:bg-white/15">
          <svg className="size-5 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input className="w-full bg-transparent text-base font-medium outline-none placeholder:text-slate-300/80" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search patient, phone, concern or PIN"/>
        </label>
      </div>
    </section>

    {/* 2. Premium Grid Metrics */}
    <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <article className="group relative overflow-hidden rounded-[24px] bg-white p-6 shadow-[0_4px_20px_#05234208] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_#0523420d] border border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex flex-col"><p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Patient profiles</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{patientRows.length}</p></div>
          <div className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-blue-50 text-blue-600 transition-transform duration-300 group-hover:scale-110 group-hover:bg-blue-100"><Users className="size-7"/></div>
        </div>
        <div className="mt-5 border-t border-slate-50 pt-4"><p className="text-xs font-medium text-slate-500">Created from real appointments</p></div>
      </article>

      <article className="group relative overflow-hidden rounded-[24px] bg-white p-6 shadow-[0_4px_20px_#05234208] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_#0523420d] border border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex flex-col"><p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Visited patients</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{visitedCount}</p></div>
          <div className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-indigo-50 text-indigo-600 transition-transform duration-300 group-hover:scale-110 group-hover:bg-indigo-100"><Activity className="size-7"/></div>
        </div>
        <div className="mt-5 border-t border-slate-50 pt-4"><p className="text-xs font-medium text-slate-500">With past booking history</p></div>
      </article>

      <article className="group relative overflow-hidden rounded-[24px] bg-white p-6 shadow-[0_4px_20px_#05234208] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_#0523420d] border border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex flex-col"><p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Upcoming visits</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{followUps}</p></div>
          <div className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-teal-50 text-teal-600 transition-transform duration-300 group-hover:scale-110 group-hover:bg-teal-100"><CalendarDays className="size-7"/></div>
        </div>
        <div className="mt-5 border-t border-slate-50 pt-4"><p className="text-xs font-medium text-slate-500">Confirmed or awaiting action</p></div>
      </article>

      <article className="group relative overflow-hidden rounded-[24px] bg-white p-6 shadow-[0_4px_20px_#05234208] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_#0523420d] border border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex flex-col"><p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Follow-up queue</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{followUpPatients}</p></div>
          <div className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-amber-50 text-amber-600 transition-transform duration-300 group-hover:scale-110 group-hover:bg-amber-100"><ClockAlert className="size-7"/></div>
        </div>
        <div className="mt-5 border-t border-slate-50 pt-4"><p className={`text-xs font-medium ${overduePatients?'text-amber-600':'text-slate-500'}`}>{overduePatients?`${overduePatients} overdue and need action`:"No overdue follow-ups"}</p></div>
      </article>

      <article className="group relative overflow-hidden rounded-[24px] bg-white p-6 shadow-[0_4px_20px_#05234208] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_#0523420d] border border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex flex-col"><p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Staff care tasks</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{openTaskCount}</p></div>
          <div className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-rose-50 text-rose-600 transition-transform duration-300 group-hover:scale-110 group-hover:bg-rose-100"><ClipboardCheck className="size-7"/></div>
        </div>
        <div className="mt-5 border-t border-slate-50 pt-4"><p className={`text-xs font-medium ${overdueTaskCount?'text-rose-600':'text-slate-500'}`}>{overdueTaskCount?`${overdueTaskCount} overdue task${overdueTaskCount===1?"":"s"}`:"Clinic queue is on track"}</p></div>
      </article>

      <article className="group relative overflow-hidden rounded-[24px] bg-white p-6 shadow-[0_4px_20px_#05234208] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_#0523420d] border border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex flex-col"><p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Updates consent</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{consented}</p></div>
          <div className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-emerald-50 text-emerald-600 transition-transform duration-300 group-hover:scale-110 group-hover:bg-emerald-100"><ShieldCheck className="size-7"/></div>
        </div>
        <div className="mt-5 border-t border-slate-50 pt-4"><p className="text-xs font-medium text-slate-500">Eligible for future broadcasts</p></div>
      </article>
    </section>

    {/* 3. Pilot Readiness Container */}
    <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-teal-50 to-emerald-50 p-6 sm:p-8 shadow-sm border border-teal-100">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-100/80 px-2.5 py-1 text-[11px] font-bold tracking-widest text-teal-800 uppercase">Clinic Pilot Readiness</span>
          <h3 className="mt-4 text-2xl font-extrabold text-teal-950 sm:text-3xl">{readyPatients} of {patientRows.length} patient journeys ready</h3>
          <p className="mt-2.5 text-sm font-medium leading-relaxed text-teal-800/80">Checks profile data, the clinical visit, a prescription or document, the next care action and communication consent.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex min-w-[120px] flex-col items-center justify-center rounded-[20px] bg-white/70 px-4 py-5 text-center shadow-sm backdrop-blur-md">
            <span className="text-3xl font-black text-teal-900">{documentedVisits}</span><span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-teal-700">Visits docs</span>
          </div>
          <div className="flex min-w-[120px] flex-col items-center justify-center rounded-[20px] bg-white/70 px-4 py-5 text-center shadow-sm backdrop-blur-md">
            <span className="text-3xl font-black text-teal-900">{activatedCarePlans}</span><span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-teal-700">Care plans</span>
          </div>
          <div className={`flex min-w-[120px] flex-col items-center justify-center rounded-[20px] px-4 py-5 text-center shadow-sm backdrop-blur-md transition-colors ${patientRows.length-readyPatients ? 'bg-orange-100/90 shadow-orange-100/50 border border-orange-200/50' : 'bg-white/70'}`}>
            <span className={`text-3xl font-black ${patientRows.length-readyPatients ? 'text-orange-700' : 'text-teal-900'}`}>{patientRows.length-readyPatients}</span><span className={`mt-1 text-[11px] font-bold uppercase tracking-wider ${patientRows.length-readyPatients ? 'text-orange-700' : 'text-teal-700'}`}>Needs action</span>
          </div>
        </div>
      </div>
    </section>

    {/* 4. Contact Table */}
    <section className="flex flex-col rounded-[24px] bg-white shadow-[0_4px_24px_#05234208] border border-slate-100/80 overflow-hidden">
      <header className="flex flex-col items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/50 p-6 sm:flex-row sm:items-center">
        <div>
          <span className="text-[11px] font-bold tracking-widest text-slate-400 uppercase">Directory</span>
          <h3 className="mt-1 text-2xl font-bold text-slate-900">{query||filter!=="all"?`${rows.length} matching patients`:`${rows.length} patients`}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl">
          {['all', 'needs_action', 'follow_up', 'tasks', 'overdue', 'upcoming'].map((f) => (
            <button key={f} onClick={() => setFilter(f as any)} className={`rounded-xl px-4 py-2 text-[13px] font-semibold transition-all duration-200 ${filter === f ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5' : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-700'}`}>
               {f === 'needs_action' ? `Needs action ${patientRows.length-readyPatients||""}` :
                f === 'follow_up' ? 'Follow-up' :
                f === 'tasks' ? `Tasks ${openTaskCount||""}` :
                f === 'overdue' ? `Overdue ${overduePatients+overdueTaskCount||""}` :
                f === 'upcoming' ? 'Upcoming' : 'All'}
            </button>
          ))}
        </div>
      </header>
      
      {rows.length===0?
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-slate-50 text-slate-400"><Users className="size-8"/></div>
          <b className="mt-4 text-base text-slate-700">No patient profiles yet</b>
          <span className="mt-1.5 max-w-sm text-sm text-slate-500">A profile is created automatically after the first public or manual appointment.</span>
        </div>
      :
      <div className="overflow-x-auto">
        <div className="grid min-w-[900px] grid-cols-[1.5fr_1fr_1.2fr_80px_140px] items-center gap-4 bg-slate-50/50 px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          <span>Patient</span><span>Contact</span><span>Latest concern</span><span>Visits</span><span>Journey status</span>
        </div>
        <div className="flex flex-col divide-y divide-slate-100">
          {rows.map((patient)=>{
            const visits=patientAppointments.get(patient.id)??[];
            const journey=patientJourneys.get(patient.id)!;
            return <button onClick={()=>setActiveId(patient.id)} key={patient.id} className="grid min-w-[900px] grid-cols-[1.5fr_1fr_1.2fr_80px_140px] items-center gap-4 px-6 py-4 text-left transition-colors duration-200 hover:bg-slate-50/80">
              <span className="flex items-center gap-4">
                <i className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#0bc4e5] to-[#514eff] font-bold text-white shadow-sm overflow-hidden">
                  {patient.avatar_url?<img src={patient.avatar_url} alt="" className="size-full object-cover"/>:patient.full_name.slice(0,1).toUpperCase()}
                </i>
                <div className="flex flex-col"><b className="text-[14px] font-bold text-slate-900">{patient.full_name}</b><small className="mt-1 text-[13px] font-medium text-slate-500">{patient.age!=null?`${patient.age} yrs`:"Age N/A"}{patient.locality?` · ${patient.locality}`:""}</small></div>
              </span>
              <span className="flex flex-col"><b className="text-[14px] font-bold text-slate-700">{patient.phone||"No phone"}</b><small className="mt-1 text-[13px] font-medium text-slate-500 truncate pr-2">{patient.email||"No email"}</small></span>
              <span className="text-[14px] font-medium text-slate-600 line-clamp-2">{patient.health_concern||"Not specified"}</span>
              <strong className="text-[15px] font-extrabold text-[#0785c1]">{visits.length}</strong>
              <span className="flex flex-col items-start gap-1.5">
                <b className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${journey.ready?"bg-[#e9faf2] text-[#087a54]":"bg-slate-100 text-slate-600"}`}>
                  {journey.ready?"✓ ":""}{journey.nextAction}
                </b>
                <small className="text-[12px] font-medium text-slate-500">{journey.completed}/{journey.total} complete</small>
              </span>
            </button>;
          })}
        </div>
      </div>}
    </section>
    {active&&<div className="patient-drawer-backdrop" onClick={()=>setActiveId(null)}><aside className="patient-drawer" onClick={(event)=>event.stopPropagation()}>
      <header><div className="patient-drawer-title"><div className="patient-avatar-editor"><i className="patient-avatar">{active.avatar_url?<img src={active.avatar_url} alt={`${active.full_name} profile`}/>:active.full_name.slice(0,1).toUpperCase()}</i><label className="patient-photo-button">{saving?"Working…":active.avatar_url?"Change photo":"Add photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={saving}/></label>{active.avatar_url&&<button className="patient-photo-remove" type="button" onClick={removeAvatar} disabled={saving}>Remove</button>}</div><div><span className="app-eyebrow">PATIENT PROFILE</span><h3>{active.full_name}</h3><small>Private clinic photo · JPEG, PNG or WebP up to 2 MB</small></div></div><div className="patient-drawer-actions"><button onClick={()=>openMode(recording?"none":"record")}>{recording?"Cancel":"Record visit"}</button><button onClick={()=>openMode(editing?"none":"edit")}>{editing?"Cancel":"Edit profile"}</button><button onClick={()=>setActiveId(null)} aria-label="Close patient">×</button></div></header>
      {activeJourney&&<section className={`patient-journey-card ${activeJourney.ready?"ready":""}`}><header><div><span className="app-eyebrow">PATIENT JOURNEY</span><h4>{activeJourney.ready?"Ready for continued care":activeJourney.nextAction}</h4></div><strong>{activeJourney.percent}%</strong></header><div className="patient-journey-progress"><i style={{width:`${activeJourney.percent}%`}}/></div><ol>{activeJourney.steps.map((step,index)=><li className={step.complete?"complete":""} key={step.key}><i>{step.complete?"✓":index+1}</i><span>{step.label}</span></li>)}</ol>{!activeJourney.ready&&<div className="patient-journey-cta">{activeJourney.nextAction==="Complete profile"?<button onClick={()=>openMode("edit")}>Complete profile</button>:activeJourney.nextAction==="Record visit"?<button onClick={()=>openMode("record")}>Record visit</button>:activeJourney.nextAction==="Add prescription or document"?<><button onClick={()=>openMode("prescribe")}>Issue prescription</button><button onClick={()=>openMode("upload")}>Upload document</button></>:activeJourney.nextAction==="Set follow-up or task"?<><button onClick={()=>openMode("care_plan")}>Create care plan</button><button onClick={()=>openMode("task")}>Add care task</button></>:<button onClick={()=>openMode("edit")}>Capture consent</button>}</div>}</section>}
      {recording&&<form className="patient-edit-form patient-encounter-form" onSubmit={saveEncounter}>
        <label>Visit type<select name="encounterType" defaultValue="consultation"><option value="consultation">Consultation</option><option value="follow_up">Follow-up</option><option value="procedure">Procedure</option><option value="vaccination">Vaccination</option><option value="other">Other</option></select></label>
        <label>Visit date<input name="occurredAt" type="datetime-local" defaultValue={new Date().toISOString().slice(0,16)} required/></label>
        <label className="wide">Linked appointment<select name="appointmentId" defaultValue=""><option value="">No linked appointment</option>{timeline.map((item)=><option key={item.id} value={item.id}>{dateLabel(item.starts_at)} · {item.service?.name||"Appointment"}</option>)}</select></label>
        <label className="wide">Diagnosis / assessment<input name="diagnosis" placeholder="e.g. Type 2 diabetes review"/></label>
        <label className="wide">Clinical note<textarea name="clinicalNote" rows={4} placeholder="Symptoms, observations and outcome" required/></label>
        <label className="wide">Treatment plan<textarea name="treatmentPlan" rows={3} placeholder="Medication, tests or care instructions"/></label>
        <label className="wide follow-up-picker">Next follow-up<input name="followUpAt" type="datetime-local" value={encounterFollowUpAt} onChange={(event)=>setEncounterFollowUpAt(event.target.value)}/><span><button type="button" onClick={()=>chooseFollowUpDays(5)}>5 days</button><button type="button" onClick={()=>chooseFollowUpDays(10)}>10 days</button><button type="button" onClick={()=>chooseFollowUpDays(15)}>15 days</button><button type="button" onClick={()=>chooseFollowUpDays(30)}>30 days</button></span><small>A WhatsApp reminder is scheduled automatically 24 hours before the revisit. Consent is checked again before delivery.</small></label>
        {error&&<p className="patient-form-error wide">{error}</p>}
        <button className="patient-save wide" disabled={saving}>{saving?"Saving…":"Save clinical record"}</button>
      </form>}
      {editing?<form className="patient-edit-form" onSubmit={saveProfile}>
        <label>Full name<input name="fullName" defaultValue={active.full_name} required/></label>
        <label>Email<input name="email" type="email" defaultValue={active.email??""}/></label>
        <label>Age<input name="age" type="number" min="0" max="120" defaultValue={active.age??""}/></label>
        <label>Location<input name="locality" defaultValue={active.locality??""}/></label>
        <label>PIN code<input name="pincode" inputMode="numeric" pattern="[0-9]{6}" defaultValue={active.pincode??""}/></label>
        <label className="wide">Health concern<input name="healthConcern" defaultValue={active.health_concern??""}/></label>
        <label className="wide">Patient notes<textarea name="patientSummary" rows={4} defaultValue={active.patient_summary??""}/></label>
        <label className="patient-check wide"><input name="careConsent" type="checkbox" defaultChecked={active.care_communications_consent}/><span><b>Care communication consent</b><small>Appointment and medication reminders</small></span></label>
        <label className="patient-check wide"><input name="marketingConsent" type="checkbox" defaultChecked={active.marketing_consent}/><span><b>Marketing consent</b><small>Health education and promotional broadcasts</small></span></label>
        {error&&<p className="patient-form-error wide">{error}</p>}
        <button className="patient-save wide" disabled={saving}>{saving?"Saving…":"Save patient profile"}</button>
      </form>:!recording&&!prescribing&&!uploading&&!creatingTask&&!creatingCarePlan&&!managingFamily&&<>
      <section className="patient-profile-grid">
        <div><span>Mobile</span><b>{active.phone||"Not supplied"}</b></div><div><span>Email</span><b>{active.email||"Not supplied"}</b></div>
        <div><span>Age</span><b>{active.age!=null?`${active.age} years`:"Not supplied"}</b></div><div><span>Location</span><b>{[active.locality,active.pincode].filter(Boolean).join(" · ")||"Not supplied"}</b></div>
      </section>
      <section className="patient-clinical-note"><span>Latest health concern</span><b>{active.health_concern||"Not specified"}</b>{active.patient_summary&&<p>{active.patient_summary}</p>}</section>
      <section className="consent-summary"><div><b>Care reminders</b><span>{active.care_communications_consent?"Allowed":"Not allowed"}</span></div><div><b>News and broadcasts</b><span className={active.marketing_consent?"allowed":""}>{active.marketing_consent?"Opted in":"Not opted in"}</span></div></section>
      <section className="patient-household"><header><div><span className="app-eyebrow">HOUSEHOLD &amp; GUARDIANS</span><h4>{activeGuardians.length} booking contact{activeGuardians.length===1?"":"s"}</h4></div>{canManageFamily&&<button onClick={()=>openMode("family")}>＋ Add contact</button>}</header><p>Booking contacts may arrange care for this patient. They do not receive clinical history through this relationship.</p>{activeGuardians.length===0?<div className="household-empty">No guardian or family booking contact recorded.</div>:activeGuardians.map((item)=><article key={item.id}><div><b>{item.guardian_name}</b><span>{item.guardian_phone} · {item.relationship}</span></div><i className={`verification-${item.verification_status}`}>{item.verification_status.replaceAll("_"," ")}</i>{canManageFamily&&<button onClick={()=>removeGuardian(item.id)} disabled={saving}>Remove</button>}</article>)}</section>
      <section className="patient-timeline consent-history"><header><div><span className="app-eyebrow">CONSENT HISTORY</span><h4>{activeConsentEvents.length} recorded decisions</h4></div></header>
        {activeConsentEvents.length===0?<p>No consent decision has been recorded yet.</p>:activeConsentEvents.map((item)=><article key={item.id}><time>{dateLabel(item.captured_at)}</time><div><b>{item.consent_type==="marketing"?"News and broadcasts":"Care communications"}</b><span>{item.new_status?"Allowed":"Withdrawn"} · {item.source.replaceAll("_"," ")}</span>{item.note&&<small>{item.note}</small>}</div><i className={`patient-status ${item.new_status?"":"consent-withdrawn"}`}>{item.new_status?"active":"withdrawn"}</i></article>)}
      </section>
      <section className="patient-follow-up-board"><header><div><span className="app-eyebrow">CARE PLAN</span><h4>Active follow-ups</h4></div><strong>{activeFollowUps.length}</strong></header>{activeFollowUps.length===0?<p>No active follow-up is pending.</p>:activeFollowUps.map((item)=>{const overdue=new Date(item.follow_up_at!).getTime()<now;return <article key={item.id} className={overdue?"overdue":""}><div><span>{overdue?"OVERDUE":"PLANNED REVISIT"}</span><b>{dateLabel(item.follow_up_at!)}</b><small>{item.diagnosis||item.clinical_note}</small></div><div><button disabled={saving} onClick={()=>updateFollowUp(item.id,"completed")}>✓ Complete</button><button disabled={saving} onClick={()=>updateFollowUp(item.id,"cancelled")}>Cancel</button></div></article>})}</section>
      <section className="patient-care-plan-board"><header><div><span className="app-eyebrow">STRUCTURED CARE PLANS</span><h4>Goals, ownership and review dates</h4></div><div><strong>{activeCarePlans.length}</strong>{canManageFamily&&<button onClick={()=>openMode("care_plan")}>＋ New plan</button>}</div></header>{activeCarePlans.length===0?<p>No active structured care plan. Create one to coordinate continued care.</p>:activeCarePlans.map((item)=>{const assignee=staff.find((member)=>member.user_id===item.assigned_to);const reviewOverdue=Boolean(item.next_review_at&&new Date(item.next_review_at).getTime()<now);const reviewTask=taskRows.find((task)=>task.care_plan_id===item.id);const patientReminder=carePlanReminderRows.find((reminder)=>reminder.care_plan_id===item.id);return <article key={item.id} className={`${item.status} ${reviewOverdue?"overdue":""}`}><div><span>{item.plan_type.replaceAll("_"," ")} · {item.status}</span><b>{item.title}</b>{item.goal&&<small><strong>Goal:</strong> {item.goal}</small>}{item.instructions&&<small>{item.instructions}</small>}<time>{item.next_review_at?`${reviewOverdue?"Review overdue · ":"Next review · "}${dateLabel(item.next_review_at)}`:"No review date"}{assignee?` · ${assignee.name}`:" · Clinic queue"}</time>{item.next_review_at&&<small><strong>Clinic queue:</strong> {reviewTask?reviewTask.status.replaceAll("_"," "):"syncing review task"}</small>}{patientReminder&&<small className="care-plan-reminder-status"><strong>Patient WhatsApp:</strong> {patientReminder.status==="active"?`scheduled ${dateLabel(patientReminder.next_run_at)}`:patientReminder.status.replaceAll("_"," ")}</small>}</div>{canManageFamily&&<aside>{item.status==="paused"?<button disabled={saving} onClick={()=>updateCarePlan(item.id,"active")}>Resume</button>:<button disabled={saving} onClick={()=>updateCarePlan(item.id,"paused")}>Pause</button>}<button disabled={saving} onClick={()=>updateCarePlan(item.id,"completed")}>✓ Complete</button><button disabled={saving} onClick={()=>updateCarePlan(item.id,"cancelled")}>Cancel</button></aside>}</article>})}</section>
      <section className="patient-task-board"><header><div><span className="app-eyebrow">STAFF ACTION QUEUE</span><h4>Open care tasks</h4></div><strong>{activeTasks.length}</strong></header>{activeTasks.length===0?<p>No staff action is pending for this patient.</p>:activeTasks.map((item)=>{const overdue=Boolean(item.due_at&&new Date(item.due_at).getTime()<now);return <article key={item.id} className={`${overdue?"overdue ":""}priority-${item.priority}`}><div><span>{item.task_type.replaceAll("_"," ")} · {item.priority}</span><b>{item.title}</b>{item.details&&<small>{item.details}</small>}<time>{item.due_at?`${overdue?"Overdue · ":"Due · "}${dateLabel(item.due_at)}`:"No due date"}</time></div><aside>{item.status==="open"&&<button disabled={saving} onClick={()=>updateTask(item.id,"in_progress")}>Start</button>}<button disabled={saving} onClick={()=>updateTask(item.id,"completed")}>✓ Complete</button><button disabled={saving} onClick={()=>updateTask(item.id,"cancelled")}>Cancel</button></aside></article>})}</section>
      <section className="patient-care-actions">{canManageFamily&&<button onClick={()=>openMode("care_plan")}><span>◎</span><b>Create care plan</b><small>Set goal, owner and next review</small></button>}<button onClick={()=>openMode("task")}><span>✓</span><b>Add care task</b><small>Calls, tests, documents or staff actions</small></button><button onClick={()=>openMode("prescribe")}><span>＋</span><b>Issue prescription</b><small>Create structured medicines and advice</small></button><button onClick={()=>openMode("upload")}><span>⇧</span><b>Upload clinical file</b><small>Private reports, scans or prescriptions</small></button></section>
      <section className="patient-timeline prescription-list"><header><div><span className="app-eyebrow">PRESCRIPTIONS</span><h4>{activePrescriptions.length} issued</h4></div></header>
        {activePrescriptions.length===0?<p>No digital prescription issued yet.</p>:activePrescriptions.map((item)=><article key={item.id}><time>{dateLabel(item.issued_at)}</time><div><b>{item.prescription_number}</b><span>{item.items.length} medicine{item.items.length===1?"":"s"}{item.diagnosis?` · ${item.diagnosis}`:""}</span></div><a className="patient-status" href={`/app/prescriptions/${item.id}`} target="_blank" rel="noreferrer">View / PDF</a></article>)}
      </section>
      <section className="patient-timeline document-list"><header><div><span className="app-eyebrow">CLINICAL DOCUMENTS</span><h4>{activeDocuments.length} files</h4></div></header>
        {activeDocuments.length===0?<p>No report or scan uploaded yet.</p>:activeDocuments.map((item)=><article key={item.id}><time>{dateLabel(item.created_at)}</time><div><b>{item.title}</b><span>{item.document_type.replaceAll("_"," ")} · {(item.file_size_bytes/1024/1024).toFixed(1)} MB</span></div><a className="patient-status" href={`/api/patients/documents/${item.id}`} target="_blank" rel="noreferrer">Open</a></article>)}
      </section>
      <section className="patient-timeline clinical-encounters"><header><div><span className="app-eyebrow">CLINICAL RECORD</span><h4>{clinicalTimeline.length} encounters</h4></div></header>
        {clinicalTimeline.length===0?<p>No clinical visit recorded yet.</p>:clinicalTimeline.map((item)=><article key={item.id}><time>{dateLabel(item.occurred_at)}</time><div><b>{item.diagnosis||item.encounter_type.replaceAll("_"," ")}</b><span>{item.clinical_note}</span>{item.treatment_plan&&<small><strong>Plan:</strong> {item.treatment_plan}</small>}{item.follow_up_at&&<small className="follow-up-note">Follow-up {dateLabel(item.follow_up_at)} · {item.follow_up_status}</small>}</div><i className="patient-status">{item.encounter_type.replaceAll("_"," ")}</i></article>)}
      </section>
      <section className="patient-timeline"><header><div><span className="app-eyebrow">BOOKING HISTORY</span><h4>{timeline.length} bookings</h4></div></header>
        {timeline.length===0?<p>No linked appointments.</p>:timeline.map((item)=><article key={item.id}><time>{dateLabel(item.starts_at)}</time><div><b>{item.service?.name||"Appointment"}</b><span>{item.location?.name||"Location"} · {item.resource?.name||"Provider"}</span>{(item.health_concern||item.patient_summary||item.notes)&&<small>{item.health_concern||item.patient_summary||item.notes}</small>}</div><i className={`patient-status status-${item.status}`}>{item.status.replaceAll("_"," ")}</i></article>)}
      </section>
      </>}
      {creatingCarePlan&&<form key={carePlanTemplate} className="patient-edit-form patient-care-plan-form" onSubmit={saveCarePlan}>
        <header className="wide"><div><span className="app-eyebrow">CONTINUED CARE</span><h4>Create a structured care plan</h4></div><button type="button" onClick={()=>setCreatingCarePlan(false)}>×</button></header>
        <p className="wide care-plan-safety-note">Care plans organize doctor-approved goals and actions. They never diagnose or recommend medicines. Patient outreach is optional and consent-controlled.</p>
        <section className="wide care-plan-templates"><b>Start from a doctor-approved workflow</b><div>{Object.entries(carePlanTemplates).map(([key,template])=><button type="button" className={carePlanTemplate===key?"active":""} onClick={()=>setCarePlanTemplate(key as keyof typeof carePlanTemplates)} key={key}>{template.label}</button>)}</div><small>Templates are editable starting points. The treating clinician remains responsible for the final plan.</small></section>
        <label>Plan type<select name="planType" defaultValue={carePlanTemplates[carePlanTemplate].planType}><option value="post_visit">Post-visit care</option><option value="chronic_care">Chronic care</option><option value="preventive">Preventive care</option><option value="recovery">Recovery</option><option value="other">Other</option></select></label>
        <label>Assign to<select name="assignedTo" defaultValue=""><option value="">Clinic queue</option>{staff.filter((item)=>item.user_id).map((item)=><option value={item.user_id!} key={item.user_id!}>{item.name} · {(item.extra?.clinic_role??"team member").replaceAll("_"," ")}</option>)}</select></label>
        <label className="wide">Plan title<input name="title" defaultValue={carePlanTemplates[carePlanTemplate].title} minLength={2} maxLength={160} placeholder="e.g. 30-day review plan" required/></label>
        <label className="wide">Care goal<textarea name="goal" defaultValue={carePlanTemplates[carePlanTemplate].goal} maxLength={1000} rows={2} placeholder="Doctor-approved outcome to track"/></label>
        <label className="wide">Instructions<textarea name="instructions" defaultValue={carePlanTemplates[carePlanTemplate].instructions} maxLength={4000} rows={4} placeholder="Staff actions, patient instructions and review criteria"/></label>
        <label className="wide">Linked visit<select name="encounterId" defaultValue=""><option value="">No linked visit</option>{clinicalTimeline.map((item)=><option value={item.id} key={item.id}>{dateLabel(item.occurred_at)} · {item.diagnosis||item.encounter_type}</option>)}</select></label>
        <label>Start date<input name="startsOn" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label>
        <label>Target date<input name="targetDate" type="date"/></label>
        <label className="wide">Next review<input name="nextReviewAt" type="datetime-local"/></label>
        <label className="patient-check wide"><input name="schedulePatientReminder" type="checkbox" disabled={!active.care_communications_consent||!active.phone}/><span><b>Schedule WhatsApp follow-up at the review time</b><small>{active.care_communications_consent&&active.phone?"Uses the approved care-update template. Consent is checked again before delivery.":"A patient mobile number and active care-communication consent are required."}</small></span></label>
        {error&&<p className="patient-form-error wide">{error}</p>}
        <button className="patient-save wide" disabled={saving}>{saving?"Activating…":"Activate care plan"}</button>
      </form>}
      {managingFamily&&<form className="patient-edit-form patient-family-form" onSubmit={saveGuardian}>
        <header className="wide"><div><span className="app-eyebrow">HOUSEHOLD ACCESS</span><h4>Add a booking contact</h4></div><button type="button" onClick={()=>setManagingFamily(false)}>×</button></header>
        <p className="wide family-safety-note">This relationship supports bookings and reminders only. It never grants access to the patient’s clinical timeline or documents.</p>
        <label>Contact name<input name="guardianName" minLength={2} maxLength={120} required/></label>
        <label>Mobile number<input name="guardianPhone" inputMode="tel" minLength={10} maxLength={40} required/></label>
        <label className="wide">Relationship<select name="relationship" defaultValue="child"><option value="child">Parent / guardian of patient</option><option value="parent">Patient manages parent</option><option value="spouse">Spouse</option><option value="relative">Relative</option><option value="other">Other / dependant</option></select></label>
        <label className="patient-check wide"><input name="staffVerified" type="checkbox"/><span><b>Staff verified this contact</b><small>Use only after checking the relationship through the clinic’s approved process.</small></span></label>
        {error&&<p className="patient-form-error wide">{error}</p>}
        <button className="patient-save wide" disabled={saving}>{saving?"Saving…":"Save booking contact"}</button>
      </form>}
      {prescribing&&<form className="patient-edit-form prescription-form" onSubmit={issuePrescription}>
        <header className="wide"><div><span className="app-eyebrow">DIGITAL PRESCRIPTION</span><h4>Issue a clinical prescription</h4></div><button type="button" onClick={()=>setPrescribing(false)}>×</button></header>
        <label className="wide">Linked clinical encounter<select name="encounterId" defaultValue=""><option value="">No linked encounter</option>{clinicalTimeline.map((item)=><option value={item.id} key={item.id}>{dateLabel(item.occurred_at)} · {item.diagnosis||item.encounter_type}</option>)}</select></label>
        <label className="wide">Assessment / diagnosis<input name="diagnosis" defaultValue={clinicalTimeline[0]?.diagnosis??active.health_concern??""}/></label>
        <section className="medicine-builder wide"><header><div><b>Medicines</b><small>Search assists transcription only. The doctor selects every medicine; OmniRelay never recommends one.</small></div><button type="button" onClick={()=>setMedicines((current)=>[...current,emptyMedicine()])}>＋ Add medicine</button></header>{medicines.map((medicine,index)=><div className="medicine-card" key={index}><div className="medicine-row"><MedicineLookup value={medicine.medicineName} selection={medicine.catalogueSelection} onChange={(value,selection)=>setMedicines((current)=>current.map((item,itemIndex)=>itemIndex===index?{...item,medicineName:value,catalogueSelection:selection}:item))}/><input aria-label="Dosage" placeholder="Dose" value={medicine.dosage} onChange={(event)=>updateMedicine(index,"dosage",event.target.value)}/><input aria-label="Frequency" placeholder="Frequency" value={medicine.frequency} onChange={(event)=>updateMedicine(index,"frequency",event.target.value)} required/><input aria-label="Duration" placeholder="Duration" value={medicine.duration} onChange={(event)=>updateMedicine(index,"duration",event.target.value)}/><input aria-label="Instructions" placeholder="Before/after food" value={medicine.instructions} onChange={(event)=>updateMedicine(index,"instructions",event.target.value)}/>{medicines.length>1&&<button type="button" aria-label="Remove medicine" onClick={()=>setMedicines((current)=>current.filter((_,itemIndex)=>itemIndex!==index))}>×</button>}</div><div className="medicine-reminder"><label><input type="checkbox" checked={medicine.reminderEnabled} disabled={!active.care_communications_consent} onChange={(event)=>updateMedicine(index,"reminderEnabled",event.target.checked)}/><span><b>Create WhatsApp reminders</b><small>{active.care_communications_consent?"Each time becomes a doctor-approved daily schedule.":"Patient care communication consent is required."}</small></span></label>{medicine.reminderEnabled&&<><label>Times (24-hour, comma separated)<input value={medicine.reminderTimes} placeholder="09:00, 21:00" onChange={(event)=>updateMedicine(index,"reminderTimes",event.target.value)}/></label><label>Days<input type="number" min="1" max="365" value={medicine.reminderDays} onChange={(event)=>updateMedicine(index,"reminderDays",Number(event.target.value))}/></label></>}</div></div>)}</section>
        <label className="wide">Tests requested<textarea name="testsRequested" rows={2}/></label>
        <label className="wide">Advice<textarea name="advice" rows={3}/></label>
        <label className="wide">Follow-up date<input name="followUpAt" type="datetime-local"/></label>
        {error&&<p className="patient-form-error wide">{error}</p>}
        <button className="patient-save wide" disabled={saving}>{saving?"Issuing…":"Issue prescription"}</button>
      </form>}
      {notice&&<p className="patient-form-notice"><span>{notice}</span>{issuedPrescriptionId&&<a href={`/app/prescriptions/${issuedPrescriptionId}`} target="_blank" rel="noreferrer">View / print prescription →</a>}</p>}
      {creatingTask&&<form className="patient-edit-form patient-task-form" onSubmit={saveTask}>
        <header className="wide"><div><span className="app-eyebrow">STAFF ACTION</span><h4>Add a patient care task</h4></div><button type="button" onClick={()=>setCreatingTask(false)}>×</button></header>
        <label>Task type<select name="taskType" defaultValue="care"><option value="care">General care</option><option value="call">Patient call</option><option value="test_review">Review test result</option><option value="document">Collect document</option><option value="follow_up">Follow-up action</option><option value="other">Other</option></select></label>
        <label>Priority<select name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label className="wide">Assign to<select name="assignedTo" defaultValue=""><option value="">Unassigned clinic queue</option>{staff.filter((item)=>item.user_id).map((item)=><option value={item.user_id!} key={item.user_id!}>{item.name} · {(item.extra?.clinic_role??"team member").replaceAll("_"," ")}</option>)}</select></label>
        <label className="wide">Task title<input name="title" maxLength={160} placeholder="e.g. Call patient after lab result" required/></label>
        <label className="wide">Instructions<textarea name="details" maxLength={2000} rows={3} placeholder="What should the doctor or assistant do?"/></label>
        <label className="wide">Due date and time<input name="dueAt" type="datetime-local"/></label>
        {error&&<p className="patient-form-error wide">{error}</p>}
        <button className="patient-save wide" disabled={saving}>{saving?"Adding…":"Add to clinic queue"}</button>
      </form>}
      {uploading&&<form className="patient-edit-form document-upload-form" onSubmit={uploadDocument}>
        <header className="wide"><div><span className="app-eyebrow">PRIVATE DOCUMENT</span><h4>Upload a clinical file</h4></div><button type="button" onClick={()=>setUploading(false)}>×</button></header>
        <label>Document type<select name="documentType" defaultValue="lab_report"><option value="lab_report">Lab report</option><option value="imaging">Imaging / scan</option><option value="prescription">External prescription</option><option value="referral">Referral</option><option value="consent">Consent</option><option value="other">Other</option></select></label>
        <label>Title<input name="title" placeholder="e.g. HbA1c report" required/></label>
        <label className="wide">Linked encounter<select name="encounterId" defaultValue=""><option value="">No linked encounter</option>{clinicalTimeline.map((item)=><option value={item.id} key={item.id}>{dateLabel(item.occurred_at)} · {item.diagnosis||item.encounter_type}</option>)}</select></label>
        <label className="wide patient-file-drop">Clinical file<input name="file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" required/><small>PDF, JPEG, PNG or WebP · maximum 10 MB</small></label>
        {error&&<p className="patient-form-error wide">{error}</p>}
        <button className="patient-save wide" disabled={saving}>{saving?"Uploading…":"Upload securely"}</button>
      </form>}
    </aside></div>}
  </main>;
}
