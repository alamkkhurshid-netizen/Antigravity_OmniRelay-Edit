"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BookingShare } from "./booking-share";

type Location = { id: string; name: string; location_type: string; address: Record<string,string>; phone: string | null };
type Service = { id: string; name: string; duration_minutes: number; buffer_minutes: number; price_paise: number | null };
type Resource = { id: string; name: string; resource_type: string; timezone: string };
type Availability = { id: string; resource_id: string; location_id: string | null; weekday: number; start_time: string; end_time: string; slot_interval_minutes: number; active: boolean };
type ScheduleException = { id:string; resource_id:string|null; location_id:string|null; starts_at:string; ends_at:string; exception_type:string; reason:string; status:string; created_at:string };
type Reminder = { id:string; appointment_id:string; event_type:string; scheduled_for:string; channel:string; status:string; attempts:number; next_attempt_at:string|null; failure_reason:string|null; sent_at:string|null; delivered_at:string|null; read_at:string|null; appointment:{customer_name:string;starts_at:string}|null };
type Appointment = {
  id: string; patient_id: string | null; resource_id: string; location_id: string; service_id: string;
  customer_name: string; customer_phone: string | null; customer_email: string | null;
  starts_at: string; ends_at: string; status: string; source: string; notes: string | null; payment_status:string;
  follow_up_at:string|null;follow_up_note:string|null;payment:Array<{payment_mode:string;amount_paise:number;status:string}>|null;
  resource: { name: string } | null; location: { name: string } | null;
  service: { name: string; duration_minutes: number } | null;
};
type DaySchedule = { weekday: number; id: string; active: boolean; start_time: string; end_time: string; slot_interval_minutes: number };

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const activeStatuses = ["pending", "confirmed", "arrived", "in_consultation"];

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}
function timeLabel(value: Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(value);
}
function dateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function addDays(key: string, amount: number) {
  const value = new Date(`${key}T00:00:00+05:30`);
  value.setDate(value.getDate() + amount);
  return dateKey(value);
}
function longDate(key: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${key}T00:00:00+05:30`));
}
function buildSchedule(availability: Availability[], resourceId: string): DaySchedule[] {
  return dayNames.map((_, weekday) => {
    const rule = availability.find((item) => item.resource_id === resourceId && item.weekday === weekday);
    return { weekday, id: rule?.id ?? "", active: Boolean(rule?.active), start_time: rule?.start_time?.slice(0,5) ?? "09:00", end_time: rule?.end_time?.slice(0,5) ?? "18:00", slot_interval_minutes: rule?.slot_interval_minutes ?? 15 };
  });
}

export function AppointmentManager({ organizationId, organizationName, businessCategory, locations, services, resources, appointments, availability, exceptions, reminders, bookingSlug, whatsappNumber, reminderCount, nowIso }: {
  organizationId: string; organizationName: string; businessCategory: string; locations: Location[]; services: Service[]; resources: Resource[]; appointments: Appointment[]; availability: Availability[]; exceptions: ScheduleException[]; reminders:Reminder[]; bookingSlug: string; whatsappNumber:string; reminderCount: number; nowIso: string; providerDepartments:Array<{resource_id:string;department_id:string}>;
}) {
  const today = dateKey(new Date(nowIso));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [notes, setNotes] = useState("");
  const [view, setView] = useState<"week" | "agenda">("week");
  const [weekStart, setWeekStart] = useState(today);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(today);
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availabilityResource, setAvailabilityResource] = useState(resources[0]?.id ?? "");
  const [schedule, setSchedule] = useState(() => buildSchedule(availability, resources[0]?.id ?? ""));
  const [disruptionOpen,setDisruptionOpen]=useState(false);
  const [disruptionResource,setDisruptionResource]=useState(resources[0]?.id??"");
  const [disruptionLocation,setDisruptionLocation]=useState("");
  const [disruptionDate,setDisruptionDate]=useState(today);
  const [disruptionStart,setDisruptionStart]=useState("09:00");
  const [disruptionEnd,setDisruptionEnd]=useState("18:00");
  const [disruptionType,setDisruptionType]=useState("emergency");
  const [disruptionReason,setDisruptionReason]=useState("");
  const [disruptionResult,setDisruptionResult]=useState<{affected_appointments:number;notifications_queued:number}|null>(null);
  const [filterLocation,setFilterLocation]=useState("");
  const [filterResource,setFilterResource]=useState("");
  const [filterStatus,setFilterStatus]=useState("active");
  const [notificationOpen,setNotificationOpen]=useState(false);
  const [followUpDate,setFollowUpDate]=useState("");
  const [followUpNote,setFollowUpNote]=useState("");
  const [followUpAppointmentId,setFollowUpAppointmentId]=useState("");
  const [documenting,setDocumenting]=useState(false);
  const [encounterType,setEncounterType]=useState("consultation");
  const [diagnosis,setDiagnosis]=useState("");
  const [clinicalNote,setClinicalNote]=useState("");
  const [treatmentPlan,setTreatmentPlan]=useState("");
  const [visitFollowUpDate,setVisitFollowUpDate]=useState("");
  const [substituteOpen,setSubstituteOpen]=useState(false);
  const [substituteResourceId,setSubstituteResourceId]=useState("");
  const [substituteDate,setSubstituteDate]=useState(today);
  const [substituteSlot,setSubstituteSlot]=useState("");

  const ready = locations.length > 0 && services.length > 0 && resources.length > 0;
  const dateOptions = Array.from({ length: 14 }, (_, index) => new Date(`${addDays(today, index)}T00:00:00+05:30`));
  const chosenService = services.find((item) => item.id === serviceId);
  function rulesFor(providerId: string, date: string, chamberId: string) {
    const weekday=new Date(`${date}T00:00:00+05:30`).getDay();
    const matching=availability.filter(item=>item.resource_id===providerId&&item.weekday===weekday&&(item.location_id===chamberId||item.location_id===null));
    // A chamber-specific session overrides only the general session at that same time;
    // distinct morning/evening sessions remain available together.
    return matching.filter(item=>item.location_id===chamberId||!matching.some(exact=>exact.location_id===chamberId&&exact.start_time===item.start_time&&exact.end_time===item.end_time));
  }
  const chosenRules = rulesFor(resourceId,selectedDate,locationId);

  function slotsFor(rules: Availability[], service: Service | undefined, date: string, providerId: string, excludedId = "") {
    if (!rules.length || !service) return [];
    const result: Array<{ iso: string; label: string; period: "Morning" | "Afternoon" }> = [];
    for (const rule of rules) for (let cursor = minutes(rule.start_time); cursor + service.duration_minutes + service.buffer_minutes <= minutes(rule.end_time); cursor += rule.slot_interval_minutes) {
      const start = new Date(`${date}T${String(Math.floor(cursor / 60)).padStart(2,"0")}:${String(cursor % 60).padStart(2,"0")}:00+05:30`);
      const end = new Date(start.getTime() + (service.duration_minutes + service.buffer_minutes) * 60000);
      const overlap = appointments.some((item) => item.id !== excludedId && item.resource_id === providerId && activeStatuses.includes(item.status) && start < new Date(item.ends_at) && end > new Date(item.starts_at));
      const blocked = exceptions.some((item) => item.status === "active" && (item.resource_id === null || item.resource_id === providerId) && (item.location_id === null || item.location_id === locationId) && start < new Date(item.ends_at) && end > new Date(item.starts_at));
      if (!overlap && !blocked && start.getTime() > new Date(nowIso).getTime()) result.push({ iso: start.toISOString(), label: timeLabel(start), period: cursor < 720 ? "Morning" : "Afternoon" });
    }
    return Array.from(new Map(result.map(slot=>[slot.iso,slot])).values()).sort((left,right)=>left.iso.localeCompare(right.iso));
  }
  const availableSlots = slotsFor(chosenRules, chosenService, selectedDate, resourceId);
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const filteredAppointments=appointments.filter((item)=>
    (!filterLocation||item.location_id===filterLocation)&&(!filterResource||item.resource_id===filterResource)&&
    (filterStatus==="all"||(filterStatus==="active"?["pending","payment_pending","confirmed","arrived","in_consultation","rescheduling_required"].includes(item.status):item.status===filterStatus))
  );
  const weekAppointments = filteredAppointments.filter((item) => item.status !== "cancelled" && dateKey(new Date(item.starts_at)) >= weekDates[0] && dateKey(new Date(item.starts_at)) <= weekDates[6]);
  const rescheduleService = activeAppointment ? services.find((item) => item.id === activeAppointment.service_id) : undefined;
  const rescheduleRules = activeAppointment ? rulesFor(activeAppointment.resource_id,rescheduleDate,activeAppointment.location_id) : [];
  const rescheduleSlots = activeAppointment ? slotsFor(rescheduleRules, rescheduleService, rescheduleDate, activeAppointment.resource_id, activeAppointment.id) : [];
  const sourceDepartmentIds=activeAppointment?providerDepartments.filter(item=>item.resource_id===activeAppointment.resource_id).map(item=>item.department_id):[];
  // A substitute is safe only when both doctors have an explicit shared department.
  // An unclassified provider must be configured in Settings before reassignment is offered.
  const substituteResources=activeAppointment&&sourceDepartmentIds.length>0?resources.filter(item=>item.id!==activeAppointment.resource_id&&providerDepartments.some(link=>link.resource_id===item.id&&sourceDepartmentIds.includes(link.department_id))):[];
  const substituteService=activeAppointment?services.find(item=>item.id===activeAppointment.service_id):undefined;
  const substituteRules=activeAppointment?rulesFor(substituteResourceId,substituteDate,activeAppointment.location_id):[];
  const substituteSlots=activeAppointment?slotsFor(substituteRules,substituteService,substituteDate,substituteResourceId,activeAppointment.id):[];

  async function createAppointment(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("create_appointment", { p_organization_id: organizationId, p_resource_id: resourceId, p_location_id: locationId, p_service_id: serviceId, p_customer_name: customerName, p_customer_phone: customerPhone, p_customer_email: customerEmail, p_starts_at: selectedSlot, p_notes: notes });
    if (error) { setMessage(error.message); setBusy(false); return; }
    window.location.reload();
  }
  function startFollowUpBooking(appointment: Appointment) {
    setCustomerName(appointment.customer_name); setCustomerPhone(appointment.customer_phone??""); setCustomerEmail(appointment.customer_email??"");
    setLocationId(appointment.location_id); setServiceId(appointment.service_id); setResourceId(appointment.resource_id);
    setSelectedDate(today); setSelectedSlot(""); setNotes(`Follow-up for appointment ${dateKey(new Date(appointment.starts_at))}`); setOpen(true);
    setMessage(`Follow-up booking: ${appointment.resource?.name??"the original doctor"} is selected first. Choose an available slot, or use the substitute flow only if necessary.`);
    window.scrollTo({top:0,behavior:"smooth"});
  }
  async function cancelAppointment(id: string) {
    await updateStatus(id, "cancelled");
  }
  async function updateStatus(id: string, status: string) {
    if (status === "completed") { setDocumenting(true); return; }
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("update_appointment_status", { p_organization_id: organizationId, p_appointment_id: id, p_status: status });
    if (error) { setMessage(error.message); setBusy(false); } else window.location.reload();
  }
  async function completeConsultation() {
    if (!activeAppointment || !clinicalNote.trim()) { setMessage("Add a clinical note before completing this consultation."); return; }
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("complete_appointment_visit", {
      p_organization_id: organizationId, p_appointment_id: activeAppointment.id,
      p_clinical_note: clinicalNote, p_diagnosis: diagnosis,
      p_treatment_plan: treatmentPlan, p_follow_up_note: treatmentPlan,
      p_follow_up_at: visitFollowUpDate ? new Date(`${visitFollowUpDate}T09:00:00+05:30`).toISOString() : null,
      p_encounter_type: encounterType,
    });
    if (error) { setMessage(error.message); setBusy(false); return; }
    setMessage("Visit documented, appointment completed and follow-up actions synchronized.");
    window.setTimeout(() => window.location.reload(), 900);
  }
  async function rescheduleAppointment() {
    if (!activeAppointment || !rescheduleSlot) return;
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("reschedule_appointment", { p_organization_id: organizationId, p_appointment_id: activeAppointment.id, p_starts_at: rescheduleSlot });
    if (error) { setMessage(error.message); setBusy(false); } else window.location.reload();
  }
  async function assignSubstitute(){
    if(!activeAppointment||!substituteResourceId||!substituteSlot)return;
    setBusy(true);setMessage("");
    const {error}=await createClient().rpc("reassign_appointment_provider",{p_organization_id:organizationId,p_appointment_id:activeAppointment.id,p_resource_id:substituteResourceId,p_starts_at:substituteSlot});
    if(error){setMessage(error.message);setBusy(false);return;}
    window.location.reload();
  }
  function loadSchedule(nextResource: string) {
    setAvailabilityResource(nextResource);
    setSchedule(buildSchedule(availability, nextResource));
  }
  async function saveAvailability() {
    setBusy(true); setMessage("");
    const supabase = createClient();
    for (const item of schedule) {
      if (item.active && minutes(item.end_time) <= minutes(item.start_time)) { setMessage(`${dayNames[item.weekday]} closing time must be after opening time.`); setBusy(false); return; }
      const payload = { active: item.active, start_time: item.start_time, end_time: item.end_time, slot_interval_minutes: item.slot_interval_minutes, updated_at: new Date().toISOString() };
      const result = item.id
        ? await supabase.from("availability_rules").update(payload).eq("id", item.id).eq("organization_id", organizationId)
        : await supabase.from("availability_rules").insert({ ...payload, organization_id: organizationId, resource_id: availabilityResource, location_id: null, weekday: item.weekday });
      if (result.error) { setMessage(result.error.message); setBusy(false); return; }
    }
    window.location.reload();
  }
  const disruptionStartIso = new Date(`${disruptionDate}T${disruptionStart}:00+05:30`).toISOString();
  const disruptionEndIso = new Date(`${disruptionDate}T${disruptionEnd}:00+05:30`).toISOString();
  const disruptionAffected = appointments.filter((item) => activeStatuses.includes(item.status) && (disruptionResource === "" || item.resource_id === disruptionResource) && (disruptionLocation === "" || item.location_id === disruptionLocation) && new Date(item.starts_at) < new Date(disruptionEndIso) && new Date(item.ends_at) > new Date(disruptionStartIso));
  async function createDisruption() {
    if (!disruptionReason.trim()) { setMessage("Add a patient-safe reason for this schedule change."); return; }
    if (new Date(disruptionEndIso) <= new Date(disruptionStartIso)) { setMessage("The end time must be after the start time."); return; }
    setBusy(true); setMessage(""); setDisruptionResult(null);
    const { data, error } = await createClient().rpc("create_schedule_exception", {
      p_organization_id: organizationId, p_resource_id: disruptionResource || null, p_location_id: disruptionLocation || null,
      p_starts_at: disruptionStartIso, p_ends_at: disruptionEndIso, p_exception_type: disruptionType, p_reason: disruptionReason,
    });
    if (error) { setMessage(error.message); setBusy(false); return; }
    setDisruptionResult(data as { affected_appointments:number; notifications_queued:number });
    window.setTimeout(() => window.location.reload(), 1100);
  }
  async function saveFollowUp() {
    if(!followUpAppointmentId||!followUpDate)return;
    setBusy(true);setMessage("");
    const {error}=await createClient().rpc("set_appointment_follow_up",{
      p_organization_id:organizationId,p_appointment_id:followUpAppointmentId,
      p_follow_up_at:new Date(`${followUpDate}T09:00:00+05:30`).toISOString(),p_note:followUpNote,
    });
    if(error){setMessage(error.message);setBusy(false);return}
    window.location.reload();
  }

  return <section className="mx-auto grid max-w-7xl gap-5 pb-12">
    <div className="grid gap-5 overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_82%_12%,rgba(51,198,221,.42),transparent_26%),linear-gradient(115deg,#06182e,#0b4263)] px-6 py-7 text-white shadow-[0_18px_48px_rgba(7,19,38,.14)] sm:px-8 xl:grid-cols-[1fr_auto] xl:items-end"><div><span className="or-type-label text-teal-300">OPERATIONS CALENDAR</span><h1 className="or-type-page mt-3">Appointments</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-200">Run the daily schedule, manage staff hours and resolve changes without double-booking.</p></div><div className="flex flex-wrap gap-2">{bookingSlug&&<><a className="inline-flex min-h-10 items-center rounded-xl bg-white/10 px-3 text-sm font-bold text-white hover:bg-white/20" href={`/book/${bookingSlug}`} target="_blank" rel="noreferrer">Open booking page</a><BookingShare slug={bookingSlug} whatsappNumber={whatsappNumber} businessName={organizationName} businessCategory={businessCategory}/></>}<button className="inline-flex min-h-10 items-center rounded-xl bg-white/10 px-3 text-sm font-bold text-white hover:bg-white/20" onClick={()=>setDisruptionOpen(!disruptionOpen)}>Emergency change</button><button className="inline-flex min-h-10 items-center rounded-xl bg-white/10 px-3 text-sm font-bold text-white hover:bg-white/20" onClick={()=>setAvailabilityOpen(!availabilityOpen)}>Availability</button><button className="inline-flex min-h-10 items-center rounded-xl bg-white px-3 text-sm font-bold text-primary hover:bg-slate-100" onClick={()=>setOpen(!open)} disabled={!ready}>{open?"Close":"+ New appointment"}</button></div></div>
    {!ready && <div className="form-message">Complete at least one location and service in <Link href="/app/settings">Business setup</Link>.</div>}
    {open && <form className="appointment-form" onSubmit={createAppointment}>
      <header><div><span className="app-eyebrow">NEW BOOKING</span><h3>Schedule an appointment</h3></div><span>Asia/Kolkata</span></header>
      <div className="form-grid">
        <label>Customer name<input value={customerName} onChange={(e)=>setCustomerName(e.target.value)} required /></label><label>Mobile number<input value={customerPhone} onChange={(e)=>setCustomerPhone(e.target.value)} placeholder="+91…" /></label>
        <label>Email<input type="email" value={customerEmail} onChange={(e)=>setCustomerEmail(e.target.value)} /></label><label>Location<select value={locationId} onChange={(e)=>{setLocationId(e.target.value);setSelectedSlot("");}} required>{locations.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Service<select value={serviceId} onChange={(e)=>{setServiceId(e.target.value);setSelectedSlot("");}} required>{services.map((item)=><option value={item.id} key={item.id}>{item.name} · {item.duration_minutes} min</option>)}</select></label><label>Provider/resource<select value={resourceId} onChange={(e)=>{setResourceId(e.target.value);setSelectedSlot("");}} required>{resources.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="wide">Notes<input value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Reason, preferences or internal note" /></label>
      </div>
      <section className="date-picker"><header><div><span>SELECT DATE</span><h4>{new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric"}).format(new Date(`${selectedDate}T00:00:00+05:30`))}</h4></div><small>14-day availability</small></header><div className="date-strip">{dateOptions.map((item)=>{const iso=dateKey(item);return <button type="button" className={selectedDate===iso?"selected":""} onClick={()=>{setSelectedDate(iso);setSelectedSlot("");}} key={iso}><span>{new Intl.DateTimeFormat("en-IN",{weekday:"short"}).format(item)}</span><b>{item.getDate()}</b><small>{new Intl.DateTimeFormat("en-IN",{month:"short"}).format(item)}</small></button>})}</div></section>
      <section className="slot-picker"><header><div><span>AVAILABLE TIMES</span><h4>{chosenService?.duration_minutes??0} minute appointment</h4></div><small>{resources.find((item)=>item.id===resourceId)?.name}</small></header>{!chosenRules.length?<p>Closed on this date.</p>:availableSlots.length===0?<p>No times available. Choose another date.</p>:<div className="slot-groups">{(["Morning","Afternoon"] as const).map((period)=>{const group=availableSlots.filter((slot)=>slot.period===period);return group.length>0&&<div key={period}><b>{period}</b><div>{group.map((slot)=><button type="button" className={selectedSlot===slot.iso?"selected":""} onClick={()=>setSelectedSlot(slot.iso)} key={slot.iso}>{slot.label}</button>)}</div></div>})}</div>}</section>
      <div className="booking-confirm"><div><span>Selected appointment</span><b>{selectedSlot?`${longDate(dateKey(new Date(selectedSlot)))} at ${timeLabel(new Date(selectedSlot))}`:"Choose an available time"}</b></div><button className="primary-button" disabled={busy||!selectedSlot}>{busy?"Checking availability…":"Confirm appointment"}</button></div>{message&&<p className="form-message" role="status">{message}</p>}
    </form>}
    {availabilityOpen && <section className="availability-editor"><header><div><span className="app-eyebrow">STAFF HOURS</span><h3>Weekly availability</h3><p>These working windows power dashboard and future WhatsApp bookings.</p></div><label>Provider<select value={availabilityResource} onChange={(e)=>loadSchedule(e.target.value)}>{resources.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></header><div className="availability-days">{schedule.map((item,index)=><div className={item.active?"availability-day active":"availability-day"} key={item.weekday}><label className="day-toggle"><input type="checkbox" checked={item.active} onChange={(e)=>setSchedule((current)=>current.map((row,rowIndex)=>rowIndex===index?{...row,active:e.target.checked}:row))}/><span></span><b>{dayNames[item.weekday]}</b></label>{item.active?<div className="day-hours"><input aria-label={`${dayNames[item.weekday]} start`} type="time" value={item.start_time} onChange={(e)=>setSchedule((current)=>current.map((row,rowIndex)=>rowIndex===index?{...row,start_time:e.target.value}:row))}/><span>to</span><input aria-label={`${dayNames[item.weekday]} end`} type="time" value={item.end_time} onChange={(e)=>setSchedule((current)=>current.map((row,rowIndex)=>rowIndex===index?{...row,end_time:e.target.value}:row))}/><select aria-label={`${dayNames[item.weekday]} interval`} value={item.slot_interval_minutes} onChange={(e)=>setSchedule((current)=>current.map((row,rowIndex)=>rowIndex===index?{...row,slot_interval_minutes:Number(e.target.value)}:row))}><option value={15}>15 min slots</option><option value={30}>30 min slots</option><option value={60}>60 min slots</option></select></div>:<span className="closed-label">Closed</span>}</div>)}</div><div className="availability-save"><span>Existing appointments remain unchanged.</span><button className="primary-button" type="button" onClick={saveAvailability} disabled={busy}>{busy?"Saving…":"Save availability"}</button></div>{message&&<p className="form-message" role="status">{message}</p>}</section>}
    {disruptionOpen&&<section className="disruption-panel"><header><div><span className="app-eyebrow">SCHEDULE EXCEPTION</span><h3>Block time and protect every affected patient</h3><p>New bookings stop immediately. Existing appointments move to rescheduling required and a notification is queued.</p></div><span className="disruption-impact">{disruptionAffected.length} affected</span></header><div className="form-grid"><label>Provider<select value={disruptionResource} onChange={(e)=>setDisruptionResource(e.target.value)}><option value="">All providers</option>{resources.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Chamber<select value={disruptionLocation} onChange={(e)=>setDisruptionLocation(e.target.value)}><option value="">All chambers</option>{locations.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Date<input type="date" min={today} value={disruptionDate} onChange={(e)=>setDisruptionDate(e.target.value)}/></label><label>Reason type<select value={disruptionType} onChange={(e)=>setDisruptionType(e.target.value)}><option value="emergency">Emergency</option><option value="leave">Doctor leave</option><option value="unavailable">Unavailable</option><option value="holiday">Holiday</option></select></label><label>Start time<input type="time" value={disruptionStart} onChange={(e)=>setDisruptionStart(e.target.value)}/></label><label>End time<input type="time" value={disruptionEnd} onChange={(e)=>setDisruptionEnd(e.target.value)}/></label><label className="wide">Patient-safe message<input value={disruptionReason} onChange={(e)=>setDisruptionReason(e.target.value)} placeholder="Doctor unavailable due to an emergency. Please choose another time."/></label></div><div className="disruption-preview"><div><b>{disruptionAffected.length} booked patients</b><span>{disruptionAffected.length?"They will receive a secure rescheduling instruction when WhatsApp/email delivery is connected.":"No existing patients overlap this period."}</span></div><button className="danger-button" onClick={createDisruption} disabled={busy||(!disruptionResource&&!disruptionLocation)}>{busy?"Applying safely…":"Block schedule & queue messages"}</button></div>{disruptionResult&&<p className="success-message">Schedule blocked. {disruptionResult.affected_appointments} appointments updated and {disruptionResult.notifications_queued} notifications queued.</p>}{message&&<p className="form-message" role="status">{message}</p>}</section>}
    {exceptions.length>0&&<section className="exception-list"><header><div><span className="app-eyebrow">ACTIVE EXCEPTIONS</span><h3>Blocked schedule periods</h3></div><span>{exceptions.filter((item)=>item.status==="active").length} active</span></header>{exceptions.slice(0,5).map((item)=><article key={item.id}><i>{item.exception_type}</i><b>{new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit",timeZone:"Asia/Kolkata"}).format(new Date(item.starts_at))} – {timeLabel(new Date(item.ends_at))}</b><span>{resources.find((resource)=>resource.id===item.resource_id)?.name??"All providers"} · {locations.find((location)=>location.id===item.location_id)?.name??"All chambers"}</span><small>{item.reason}</small></article>)}</section>}
    <div className="calendar-summary"><article><span>Providers</span><b>{resources.length}</b><small>Staff and bookable resources</small></article><article><span>Locations</span><b>{locations.length}</b><small>Available for booking</small></article><article><span>Appointments</span><b>{appointments.filter((item)=>item.status!=="cancelled").length}</b><small>Current schedule</small></article><article className="reminder-metric" onClick={()=>setNotificationOpen(!notificationOpen)}><span>Reminders queued</span><b>{reminderCount}</b><small>Open notification operations →</small></article></div>
    {notificationOpen&&<section className="notification-operations"><header><div><span className="app-eyebrow">AUTOMATED DELIVERY</span><h3>Patient communications</h3><p>The production worker checks this queue every minute. Approved Meta templates are required before WhatsApp delivery begins.</p></div><button onClick={()=>setNotificationOpen(false)}>Close</button></header><div className="notification-table"><div className="notification-head"><span>Patient</span><span>Message</span><span>Channel</span><span>Scheduled</span><span>Status</span></div>{reminders.length?reminders.map((item)=>{const delivery=item.read_at?"read":item.delivered_at?"delivered":item.sent_at?"sent":item.status;return <article key={item.id} title={item.failure_reason??undefined}><b>{item.appointment?.customer_name??"Patient"}</b><span>{item.event_type.replaceAll("_"," ")}{item.failure_reason&&<small> · {item.failure_reason}</small>}</span><i>{item.channel}</i><time>{new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit",timeZone:"Asia/Kolkata"}).format(new Date(item.scheduled_for))}</time><em className={`queue-${delivery}`}>{delivery}{item.next_attempt_at&&item.status==="scheduled"?" · retry queued":""}</em></article>}):<p>No communication events yet.</p>}</div></section>}
    <section className="follow-up-planner"><header><div><span className="app-eyebrow">CONTINUITY OF CARE</span><h3>Schedule a revisit reminder</h3><p>Choose a past or current patient visit, set the revisit date, and OmniRelay queues the reminder using the patient’s consented channel.</p></div>{appointments.filter((item)=>item.follow_up_at&&new Date(item.follow_up_at)>new Date(nowIso)).length>0&&<span>{appointments.filter((item)=>item.follow_up_at&&new Date(item.follow_up_at)>new Date(nowIso)).length} upcoming</span>}</header><div><label>Patient visit<select value={followUpAppointmentId} onChange={(e)=>setFollowUpAppointmentId(e.target.value)}><option value="">Select appointment</option>{appointments.filter((item)=>["confirmed","completed"].includes(item.status)).map((item)=><option key={item.id} value={item.id}>{item.customer_name} · {new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Kolkata"}).format(new Date(item.starts_at))}</option>)}</select></label><label>Revisit date<input type="date" min={addDays(today,1)} value={followUpDate} onChange={(e)=>setFollowUpDate(e.target.value)}/></label><label>Reminder note<input value={followUpNote} maxLength={240} onChange={(e)=>setFollowUpNote(e.target.value)} placeholder="Example: Diabetes follow-up with reports"/></label><button onClick={saveFollowUp} disabled={busy||!followUpAppointmentId||!followUpDate}>{busy?"Scheduling…":"Schedule revisit reminder"}</button>{followUpAppointmentId&&<button type="button" className="secondary-button" onClick={()=>{const appointment=appointments.find(item=>item.id===followUpAppointmentId);if(appointment)startFollowUpBooking(appointment)}}>Book with original doctor</button>}</div></section>
    <section className="operations-calendar"><header><div><span className="app-eyebrow">SCHEDULE</span><h3>{view==="week"?"Week calendar":"Appointment agenda"}</h3></div><div className="calendar-controls"><div><button onClick={()=>setWeekStart(addDays(weekStart,-7))} aria-label="Previous week">←</button><button onClick={()=>setWeekStart(today)}>Today</button><button onClick={()=>setWeekStart(addDays(weekStart,7))} aria-label="Next week">→</button></div><div><button className={view==="week"?"active":""} onClick={()=>setView("week")}>Week</button><button className={view==="agenda"?"active":""} onClick={()=>setView("agenda")}>Agenda</button></div></div></header>
      <div className="calendar-filters"><label>Chamber<select value={filterLocation} onChange={(e)=>setFilterLocation(e.target.value)}><option value="">All chambers</option>{locations.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Provider<select value={filterResource} onChange={(e)=>setFilterResource(e.target.value)}><option value="">All providers</option>{resources.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Status<select value={filterStatus} onChange={(e)=>setFilterStatus(e.target.value)}><option value="active">Active work</option><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="arrived">Arrived</option><option value="in_consultation">In consultation</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No-show</option><option value="rescheduling_required">Needs rescheduling</option></select></label><span>{filteredAppointments.length} matching appointments</span></div>
      {view==="week"?<div className="week-calendar">{weekDates.map((key)=>{const dayItems=weekAppointments.filter((item)=>dateKey(new Date(item.starts_at))===key);return <section className={key===today?"calendar-day today":"calendar-day"} key={key}><header><span>{new Intl.DateTimeFormat("en-IN",{weekday:"short"}).format(new Date(`${key}T00:00:00+05:30`))}</span><b>{new Date(`${key}T00:00:00+05:30`).getDate()}</b></header><div>{dayItems.map((item)=><button className={`calendar-event status-${item.status}`} onClick={()=>{setActiveAppointment(item);setRescheduleDate(dateKey(new Date(item.starts_at)));setRescheduleSlot("");setRescheduling(false);}} key={item.id}><time>{timeLabel(new Date(item.starts_at))}</time><b>{item.customer_name}</b><span>{item.service?.name}</span><small>{item.location?.name}</small></button>)}{dayItems.length===0&&<span className="calendar-free">No bookings</span>}</div></section>})}</div>:<div className="appointment-list">{appointments.length===0?<div className="appointment-empty"><b>No appointments yet</b><span>Create the first manual booking to verify the calendar flow.</span></div>:appointments.map((item)=><article className={`appointment-item status-${item.status}`} key={item.id} onClick={()=>{setActiveAppointment(item);setRescheduleDate(dateKey(new Date(item.starts_at)));setRescheduling(false);}}><div className="appointment-time"><b>{new Intl.DateTimeFormat("en-IN",{day:"2-digit",month:"short"}).format(new Date(item.starts_at))}</b><span>{timeLabel(new Date(item.starts_at))}</span></div><div className="appointment-customer"><b>{item.customer_name}</b><span>{item.service?.name??"Service"} · {item.location?.name??"Location"} · {item.resource?.name??"Provider"}</span><small>{item.customer_phone||item.customer_email||"No contact supplied"}</small></div><span className="appointment-status">{item.status}</span></article>)}</div>}
    </section>
    {activeAppointment&&<div className="appointment-drawer-backdrop" onClick={()=>setActiveAppointment(null)}><aside className="appointment-drawer" onClick={(e)=>e.stopPropagation()}><header><div><span className="app-eyebrow">APPOINTMENT</span><h3>{activeAppointment.customer_name}</h3></div><button onClick={()=>setActiveAppointment(null)} aria-label="Close details">×</button></header><div className="appointment-detail-time"><b>{longDate(dateKey(new Date(activeAppointment.starts_at)))}</b><span>{timeLabel(new Date(activeAppointment.starts_at))}–{timeLabel(new Date(activeAppointment.ends_at))}</span></div><dl><div><dt>Status</dt><dd>{activeAppointment.status.replaceAll("_"," ")}</dd></div><div><dt>Service</dt><dd>{activeAppointment.service?.name}</dd></div><div><dt>Provider</dt><dd>{activeAppointment.resource?.name}</dd></div><div><dt>Location</dt><dd>{activeAppointment.location?.name}</dd></div><div><dt>Contact</dt><dd>{activeAppointment.customer_phone||activeAppointment.customer_email||"Not supplied"}</dd></div><div><dt>Source</dt><dd>{activeAppointment.source}</dd></div>{activeAppointment.notes&&<div><dt>Notes</dt><dd>{activeAppointment.notes}</dd></div>}</dl>{(activeStatuses.includes(activeAppointment.status)||activeAppointment.status==="rescheduling_required")&&<><div className="lifecycle-actions">{activeAppointment.status==="pending"&&<button onClick={()=>updateStatus(activeAppointment.id,"confirmed")} disabled={busy}>Confirm</button>}{activeAppointment.status==="confirmed"&&<button onClick={()=>updateStatus(activeAppointment.id,"arrived")} disabled={busy}>Mark arrived</button>}{activeAppointment.status==="arrived"&&<button onClick={()=>updateStatus(activeAppointment.id,"in_consultation")} disabled={busy}>Start consultation</button>}{["confirmed","arrived","in_consultation"].includes(activeAppointment.status)&&<button onClick={()=>updateStatus(activeAppointment.id,"completed")} disabled={busy}>Complete & document</button>}{["confirmed"].includes(activeAppointment.status)&&<button onClick={()=>updateStatus(activeAppointment.id,"no_show")} disabled={busy}>Mark no-show</button>}</div><div className="drawer-actions"><button className="secondary-button" onClick={()=>setRescheduling(!rescheduling)}>{rescheduling?"Keep current time":"Reschedule"}</button>{substituteResources.length>0&&<button className="secondary-button" onClick={()=>{setSubstituteOpen(!substituteOpen);setSubstituteResourceId(substituteResources[0]?.id??"");setSubstituteDate(dateKey(new Date(activeAppointment.starts_at)));setSubstituteSlot("")}}>Offer substitute doctor</button>}<button className="danger-button" onClick={()=>cancelAppointment(activeAppointment.id)} disabled={busy}>Cancel appointment</button></div></>}{rescheduling&&<section className="reschedule-panel"><b>Choose a new time</b><div className="reschedule-dates">{Array.from({length:14},(_,index)=>addDays(today,index)).map((key)=><button className={rescheduleDate===key?"selected":""} onClick={()=>{setRescheduleDate(key);setRescheduleSlot("");}} key={key}><span>{new Intl.DateTimeFormat("en-IN",{weekday:"short"}).format(new Date(`${key}T00:00:00+05:30`))}</span><b>{new Date(`${key}T00:00:00+05:30`).getDate()}</b></button>)}</div><div className="reschedule-slots">{rescheduleSlots.length?rescheduleSlots.map((slot)=><button className={rescheduleSlot===slot.iso?"selected":""} onClick={()=>setRescheduleSlot(slot.iso)} key={slot.iso}>{slot.label}</button>):<span>No available times on this date.</span>}</div><button className="primary-button" onClick={rescheduleAppointment} disabled={!rescheduleSlot||busy}>{busy?"Checking…":"Confirm new time"}</button></section>}{substituteOpen&&<section className="reschedule-panel"><b>Offer a suitable colleague</b><p>Only doctors sharing this booking&apos;s department are shown. OmniRelay rechecks chamber, service, schedule and slot availability before changing the appointment.</p><select value={substituteResourceId} onChange={event=>{setSubstituteResourceId(event.target.value);setSubstituteSlot("")}}>{substituteResources.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="reschedule-dates">{Array.from({length:14},(_,index)=>addDays(today,index)).map((key)=><button className={substituteDate===key?"selected":""} onClick={()=>{setSubstituteDate(key);setSubstituteSlot("");}} key={key}><span>{new Intl.DateTimeFormat("en-IN",{weekday:"short"}).format(new Date(`${key}T00:00:00+05:30`))}</span><b>{new Date(`${key}T00:00:00+05:30`).getDate()}</b></button>)}</div><div className="reschedule-slots">{substituteSlots.length?substituteSlots.map((slot)=><button className={substituteSlot===slot.iso?"selected":""} onClick={()=>setSubstituteSlot(slot.iso)} key={slot.iso}>{slot.label}</button>):<span>No suitable slots on this date.</span>}</div><button className="primary-button" onClick={assignSubstitute} disabled={!substituteSlot||busy}>{busy?"Checking…":"Confirm substitute doctor"}</button></section>}{message&&<p className="form-message" role="status">{message}</p>}</aside></div>}
    {documenting&&activeAppointment&&<div className="clinical-modal-backdrop"><section className="clinical-completion" role="dialog" aria-modal="true" aria-label="Complete consultation"><header><div><span className="app-eyebrow">CLINICAL RECORD</span><h4>Complete consultation</h4></div><button onClick={()=>setDocumenting(false)} aria-label="Close clinical record">×</button></header><p>This links the patient, saves one visit, closes the appointment and prepares any follow-up action in one transaction.</p><label>Visit type<select value={encounterType} onChange={(e)=>setEncounterType(e.target.value)}><option value="consultation">Consultation</option><option value="follow_up">Follow-up</option><option value="procedure">Procedure</option><option value="vaccination">Vaccination</option><option value="other">Other</option></select></label><label>Diagnosis / concern<input value={diagnosis} onChange={(e)=>setDiagnosis(e.target.value)} placeholder="Optional working diagnosis or concern"/></label><label>Clinical note <em>required</em><textarea value={clinicalNote} onChange={(e)=>setClinicalNote(e.target.value)} placeholder="Document observations, assessment and advice"/></label><label>Treatment / follow-up instructions<textarea value={treatmentPlan} onChange={(e)=>setTreatmentPlan(e.target.value)} placeholder="Plan, tests, referral or patient-safe follow-up instructions"/></label><label>Follow-up date<input type="date" min={addDays(today,1)} value={visitFollowUpDate} onChange={(e)=>setVisitFollowUpDate(e.target.value)}/></label><div className="follow-up-picks">{[5,10,15,30].map((days)=><button type="button" key={days} onClick={()=>setVisitFollowUpDate(addDays(today,days))}>{days} days</button>)}</div><button className="primary-button" onClick={completeConsultation} disabled={busy||!clinicalNote.trim()}>{busy?"Saving visit…":"Save visit & complete"}</button>{message&&<p className="form-message" role="status">{message}</p>}</section></div>}
  </section>;
}
