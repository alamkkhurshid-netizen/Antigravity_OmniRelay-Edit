"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Clock, MapPin, Stethoscope } from "lucide-react";

type Appointment={id:string;resource_id:string;location_id:string;customer_name:string;starts_at:string;status:string;follow_up_at:string|null};
type Option={id:string;name:string};
type QueueEntry={appointment_id:string;resource_id:string;location_id:string;queue_date:string;token_number:number;queue_status:string};
const dayKey=(value:Date|string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata"}).format(new Date(value));
const addDays=(date:string,days:number)=>{const value=new Date(`${date}T00:00:00+05:30`);value.setUTCDate(value.getUTCDate()+days);return dayKey(value)};
const toIso=(date:string)=>new Date(`${date}T09:00:00+05:30`).toISOString();
const label=(value:string)=>new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",hour:"numeric",minute:"2-digit"}).format(new Date(value));

export function ReceptionBoard({organizationId,appointments,resources,locations,queueEntries,nowIso}:{organizationId:string;appointments:Appointment[];resources:Option[];locations:Option[];queueEntries:QueueEntry[];nowIso:string}){
  const router = useRouter();
  const todayDate = dayKey(new Date(nowIso));
  const tomorrowDate = addDays(todayDate, 1);
  const [date,setDate]=useState(todayDate),[resourceId,setResourceId]=useState(""),[locationId,setLocationId]=useState(""),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(""),[notice,setNotice]=useState("");
  const rows=useMemo(()=>appointments.filter(item=>dayKey(item.starts_at)===date&&["pending","payment_pending","confirmed","arrived","in_consultation","rescheduling_required"].includes(item.status)&&(!resourceId||item.resource_id===resourceId)&&(!locationId||item.location_id===locationId)).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)),[appointments,date,resourceId,locationId]);
  const queueMap=useMemo(()=>new Map(queueEntries.map(item=>[item.appointment_id,item])),[queueEntries]);
  const eligible=rows.filter(item=>["confirmed","arrived","in_consultation"].includes(item.status));

  function downloadRoster() {
    const url = `/api/clinic-operations/roster/export?date=${encodeURIComponent(date)}${resourceId ? `&doctorId=${encodeURIComponent(resourceId)}` : ""}&format=csv`;
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `daily-roster-${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setNotice(`Downloading daily booking sheet for ${date}...`);
  }

  async function triggerEmailDispatch() {
    setBusy("dispatch");
    setNotice("");
    try {
      const res = await fetch("/api/clinic-operations/roster/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to dispatch email");
      const clinicResult = data.results?.find((r: { type: string }) => r.type === "clinic");
      const doctorResults = data.results?.filter((r: { type: string }) => r.type === "doctor") || [];
      const simulatedNotice = !data.liveEmailConfigured ? " (Preview mode: add RESEND_API_KEY for live delivery)" : "";
      setNotice(`Daily roster dispatched for ${date}! Clinic: ${clinicResult?.status || "ok"}, Doctors notified: ${doctorResults.filter((r: { status: string }) => r.status !== "failed").length}/${doctorResults.length}${simulatedNotice}`);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Failed to dispatch email");
    } finally {
      setBusy("");
    }
  }

  async function markArrived(ids:string[]){
    if(!ids.length)return;setBusy("arrived");setNotice("");
    const client=createClient();const results=await Promise.all(ids.map(id=>client.rpc("update_appointment_status",{p_organization_id:organizationId,p_appointment_id:id,p_status:"arrived"})));
    const failed=results.find(item=>item.error);setBusy("");setSelected([]);setNotice(failed?.error?.message??`${ids.length} patient${ids.length===1?"":"s"} marked arrived.`);if(!failed)router.refresh();
  }
  async function followUp(appointment:Appointment,days:number){setBusy(appointment.id);setNotice("");const {error}=await createClient().rpc("set_appointment_follow_up",{p_organization_id:organizationId,p_appointment_id:appointment.id,p_follow_up_at:toIso(addDays(date,days)),p_note:`Follow-up planned ${days} days after visit.`});setBusy("");setNotice(error?.message??`${appointment.customer_name}: follow-up planned.`);if(!error)router.refresh();}
  async function assignToken(appointment:Appointment){setBusy(appointment.id);setNotice("");const {data,error}=await createClient().rpc("assign_appointment_queue_token",{p_organization_id:organizationId,p_appointment_id:appointment.id});setBusy("");setNotice(error?.message??`${appointment.customer_name}: token #${data.token_number} assigned.`);if(!error)router.refresh();}
  async function setServing(entry:QueueEntry){setBusy(entry.appointment_id);setNotice("");const {error}=await createClient().rpc("set_queue_now_serving",{p_organization_id:organizationId,p_resource_id:entry.resource_id,p_location_id:entry.location_id,p_queue_date:entry.queue_date,p_token_number:entry.token_number});setBusy("");setNotice(error?.message??`Now serving token #${entry.token_number}. Patient WhatsApp queue alerts remain off until the dedicated Meta template is approved.`);if(!error)router.refresh();}
  return <section className="reception-board" id="reception-board">
    <section className="relative flex flex-col gap-6 overflow-hidden rounded-2xl bg-slate-950 px-6 py-8 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:px-8 isolate mb-6">
      {/* Ambient Orbs & Grain */}
      <div className="absolute -top-32 -right-32 h-[30rem] w-[30rem] rounded-full bg-teal-500/20 blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 h-[30rem] w-[30rem] rounded-full bg-blue-600/20 blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none -z-10" />
      
      <div className="z-10 max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-teal-400 ring-1 ring-inset ring-teal-500/20 uppercase">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-500"></span>
          </span>
          RECEPTION OPERATIONS
        </span>
        <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-100 to-slate-400 leading-[1.15]">
          Appointments & Patient Board
        </h1>
        <p className="mt-4 text-sm sm:text-base text-slate-400 font-medium tracking-wide">
          Use any date, doctor or chamber. Batch arrival and follow-up actions reduce end-of-session work; clinical completion remains protected in the appointment record.
        </p>
      </div>
      
      <div className="flex flex-wrap items-center gap-3 z-10">
        <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-[13px] font-bold text-white shadow-sm backdrop-blur-md transition-all hover:bg-white/10" onClick={downloadRoster} title="Download Doctor-wise Booking Story as Excel/CSV">
          📥 Download Sheet
        </button>
        <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-[13px] font-bold text-white shadow-sm backdrop-blur-md transition-all hover:bg-white/10" disabled={busy!==""} onClick={triggerEmailDispatch} title="Send Daily Summary Email to Clinic & Doctors">
          {busy==="dispatch" ? "Dispatching..." : "✉️ Dispatch Email"}
        </button>
        <span className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-teal-400 to-blue-500 px-4 py-2 text-[13px] font-bold text-slate-950 shadow-[0_0_20px_rgba(45,212,191,0.25)]">
          {rows.length} active visit{rows.length===1?"":"s"}
        </span>
      </div>
    </section>
    <div className="reception-filters">
      <label>
        Date
        <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
          <input type="date" value={date} onChange={event=>{setDate(event.target.value);setSelected([])}}/>
          <button type="button" style={{padding:"6px 9px",fontSize:"11px",borderRadius:"6px",border:"1px solid #dce5eb",background:date===todayDate?"#eaf9fc":"#fff",fontWeight:date===todayDate?700:500,cursor:"pointer"}} onClick={()=>{setDate(todayDate);setSelected([])}}>Today</button>
          <button type="button" style={{padding:"6px 9px",fontSize:"11px",borderRadius:"6px",border:"1px solid #dce5eb",background:date===tomorrowDate?"#eaf9fc":"#fff",fontWeight:date===tomorrowDate?700:500,cursor:"pointer"}} onClick={()=>{setDate(tomorrowDate);setSelected([])}}>Tomorrow</button>
        </div>
      </label>
      <label>Doctor<select value={resourceId} onChange={event=>{setResourceId(event.target.value);setSelected([])}}><option value="">All doctors</option>{resources.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Chamber<select value={locationId} onChange={event=>{setLocationId(event.target.value);setSelected([])}}><option value="">All chambers</option>{locations.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button type="button" className="secondary-button" style={{background:"#0f172a", color:"#fff", borderColor:"#0f172a", fontWeight:600}} disabled={!selected.length||busy!==""} onClick={()=>markArrived(selected.filter(id=>rows.find(row=>row.id===id)?.status==="confirmed"))}>{busy==="arrived" ? "Processing..." : "Mark selected arrived"}</button>
    </div>
    <div className="reception-queue-note">
      <b>Patient queue & daily booking story</b>
      <span>Download the complete doctor-wise patient roster as a spreadsheet or dispatch the evening briefing to clinic staff and doctors with a single click.</span>
    </div>
    {rows.length===0?<p className="provider-note">No active appointments match this date and filter.</p>:<div className="reception-list">{rows.map(appointment=>{const entry=queueMap.get(appointment.id);return <article key={appointment.id}><label className="reception-select"><input type="checkbox" checked={selected.includes(appointment.id)} disabled={appointment.status!=="confirmed"} onChange={event=>setSelected(current=>event.target.checked?[...current,appointment.id]:current.filter(id=>id!==appointment.id))}/></label><div className="reception-patient"><div className="reception-patient-title"><b>{label(appointment.starts_at)} · {appointment.customer_name}</b><span className={`status-badge ${appointment.status}`}>{appointment.status.replaceAll("_"," ")}</span>{entry && <span className="status-badge" style={{background:"#f8fafc", color:"#475569", border:"1px solid #cbd5e1"}}>Token #{entry.token_number}</span>}</div><div className="reception-patient-meta"><span><Stethoscope size={14}/> {resources.find(item=>item.id===appointment.resource_id)?.name??"Doctor"}</span><span><MapPin size={14}/> {locations.find(item=>item.id===appointment.location_id)?.name??"Chamber"}</span>{appointment.follow_up_at && <span><Clock size={14}/> Follow-up {dayKey(appointment.follow_up_at)}</span>}{entry && <span style={{textTransform:"capitalize"}}>({entry.queue_status})</span>}</div></div><div className="reception-actions">{appointment.status==="confirmed"&&<button type="button" className="primary-action" disabled={busy!==""} onClick={()=>markArrived([appointment.id])}>{busy===appointment.id ? "..." : "Arrived"}</button>}{["confirmed","arrived","in_consultation"].includes(appointment.status)&&!entry&&<button type="button" disabled={busy!==""} onClick={()=>assignToken(appointment)}>Assign token</button>}{entry&&<button type="button" className={entry.queue_status!=="called" ? "primary-action" : ""} disabled={busy!==""||entry.queue_status==="called"} onClick={()=>setServing(entry)}>{entry.queue_status==="called"?"Now serving":"Set serving"}</button>}{["confirmed","arrived","in_consultation"].includes(appointment.status)&&<><button type="button" disabled={busy!==""} onClick={()=>followUp(appointment,10)}>10D</button><button type="button" disabled={busy!==""} onClick={()=>followUp(appointment,30)}>30D</button></>}</div></article>})}</div>}
    {notice&&<p className="form-message" role="status">{notice}</p>}
  </section>;
}
