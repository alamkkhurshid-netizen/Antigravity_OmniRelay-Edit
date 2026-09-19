"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Template = {id:string;event_type:string;provider_template_name:string;language_code:string;status:string;variable_map:Record<string,string>|null};
type Reminder = {event_type:string;status:string};
type DoctorDispatch = {status:string};

const lifecycleGroups=[
  {key:"confirmation",title:"Booking confirmation",description:"Sent after a web, staff or WhatsApp booking is confirmed.",events:["confirmation"]},
  {key:"appointment-reminder",title:"Appointment reminders",description:"One approved template safely serves both 24-hour and 2-hour reminders.",events:["reminder_24h","reminder_2h"]},
  {key:"booking-change",title:"Cancellation and reschedule",description:"Keeps affected patients informed when a booking or chamber schedule changes.",events:["cancellation","reschedule"]},
  {key:"follow-up",title:"Follow-up and revisit",description:"Sent on the doctor-approved follow-up date with a safe booking link.",events:["follow_up"]},
  {key:"doctor-queue",title:"Doctor queue update",description:"Sent before a visiting doctor's shift after explicit WhatsApp consent.",events:["doctor_queue"]},
];

export function TemplateReadiness({templates,reminders,doctorDispatches}:{templates:Template[];reminders:Reminder[];doctorDispatches:DoctorDispatch[]}){
  const [confirmed,setConfirmed]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const groups=useMemo(()=>lifecycleGroups.map(group=>{
    const rows=templates.filter(template=>group.events.includes(template.event_type));
    const doctorGroup=group.key==="doctor-queue";
    const deliveryRows=doctorGroup?doctorDispatches:reminders.filter(row=>group.events.includes(row.event_type));
    return {...group,rows,templateName:rows[0]?.provider_template_name??"Not configured",approved:rows.length===group.events.length&&rows.every(row=>row.status==="approved"),liveVerified:deliveryRows.some(row=>row.status==="sent"||row.status==="delivered"||row.status==="read"),queued:deliveryRows.filter(row=>row.status==="scheduled"||row.status==="queued").length,failed:deliveryRows.filter(row=>row.status==="failed").length,variables:Object.entries(rows[0]?.variable_map??{}).sort(([a],[b])=>Number(a)-Number(b))};
  }),[templates,reminders,doctorDispatches]);

  async function activate(key:string,ids:string[]){
    if(!confirmed[key]||ids.length===0)return;
    setBusy(key);setNotice("");
    const {error}=await createClient().from("channel_message_templates").update({status:"approved",updated_at:new Date().toISOString()}).in("id",ids);
    if(error){setNotice(error.message);setBusy("");return;}
    window.location.reload();
  }

  return <section className="template-activation">
    <header><div><span className="app-eyebrow">PRODUCTION TEMPLATE HEALTH</span><h3>Approval and real delivery are different checks</h3><p>A template is ready only when its exact mapping is confirmed and Meta has accepted a live delivery from the currently connected WhatsApp account.</p></div><a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noreferrer">Open WhatsApp Manager ↗</a></header>
    <div className="template-activation-grid">{groups.map(group=><article className={group.liveVerified?"ready":group.approved?"configured":"blocked"} key={group.key}>
      <div className="template-activation-title"><i>{group.liveVerified?"✓":group.approved?"•":"!"}</i><div><b>{group.title}</b><span>{group.description}</span></div></div>
      <code>{group.templateName}</code>
      <div className="template-variable-list">{group.variables.map(([position,name])=><span key={position}>{`{{${position}}}`} {name.replaceAll("_"," ")}</span>)}</div>
      <div className="template-queue-summary"><span><b>{group.queued}</b> queued</span><span><b>{group.failed}</b> failed</span><strong>{group.liveVerified?"Live delivery verified":group.approved?"Configured · test pending":"Blocked by approval"}</strong></div>
      {!group.approved&&<><label className="template-confirmation"><input type="checkbox" checked={Boolean(confirmed[group.key])} onChange={event=>setConfirmed({...confirmed,[group.key]:event.target.checked})}/><span>I confirm this exact template shows <b>Active</b> in WhatsApp Manager.</span></label><button onClick={()=>activate(group.key,group.rows.map(row=>row.id))} disabled={!confirmed[group.key]||busy===group.key}>{busy===group.key?"Activating…":"Activate in OmniRelay"}</button></>}
    </article>)}</div>
    {notice&&<p className="form-message" role="status">{notice}</p>}
    <footer><b>Safety rule</b><span>“Configured” is not treated as proof of delivery. A green verification appears only after Meta accepts a message from the connected production sender.</span></footer>
  </section>;
}
