"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
      <header className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">PRODUCTION TEMPLATE HEALTH</span>
          <h3 className="text-sm font-bold text-slate-900 leading-snug">Approval and real delivery are different checks</h3>
          <p className="mt-0.5 text-[11px] font-medium text-slate-600 leading-normal">
            A template is ready only when its exact mapping is confirmed and Meta has accepted a live delivery from the currently connected WhatsApp account.
          </p>
        </div>
        <a
          href="https://business.facebook.com/wa/manage/message-templates/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition"
        >
          Open WhatsApp Manager ↗
        </a>
      </header>

      <div className="divide-y divide-slate-100">
        {groups.map((group) => (
          <article
            className={`py-3 flex flex-col gap-2.5 ${
              group.liveVerified ? "bg-emerald-50/20" : group.approved ? "bg-blue-50/10" : ""
            }`}
            key={group.key}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold ${
                    group.liveVerified
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : group.approved
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                >
                  {group.liveVerified ? "✓" : group.approved ? "•" : "!"}
                </span>
                <div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <b className="text-xs font-bold text-slate-900">{group.title}</b>
                    <code className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-mono text-slate-700">
                      {group.templateName}
                    </code>
                  </div>
                  <span className="mt-0.5 block text-[11px] font-medium text-slate-600">
                    {group.description}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end shrink-0 pl-8 sm:pl-0">
                <span className="text-[11px] text-slate-600 font-medium">
                  <b className="text-slate-900 font-bold">{group.queued}</b> queued
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-[11px] text-slate-600 font-medium">
                  <b className="text-slate-900 font-bold">{group.failed}</b> failed
                </span>
                <strong
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
                    group.liveVerified
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : group.approved
                      ? "bg-blue-50 text-blue-800 border border-blue-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}
                >
                  {group.liveVerified
                    ? "Live delivery verified"
                    : group.approved
                    ? "Configured · test pending"
                    : "Blocked by approval"}
                </strong>
              </div>
            </div>

            {/* Variable Pills */}
            {group.variables.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pl-8.5">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Params:</span>
                {group.variables.map(([position, name]) => (
                  <span
                    className="inline-flex items-center gap-1 rounded bg-slate-100/80 border border-slate-200/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 capitalize"
                    key={position}
                  >
                    <code className="text-[9px] font-bold text-teal-700">{`{{${position}}}`}</code>
                    {name.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
            )}

            {/* Confirmation & Activation Action */}
            {!group.approved && (
              <div className="mt-1 ml-8.5 flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-amber-200/80 bg-amber-50/50 p-2 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer text-[11px] font-medium text-slate-700">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    checked={Boolean(confirmed[group.key])}
                    onChange={(event) =>
                      setConfirmed({ ...confirmed, [group.key]: event.target.checked })
                    }
                  />
                  <span>
                    I confirm this exact template shows <strong className="font-bold text-slate-900">Active</strong> in WhatsApp Manager.
                  </span>
                </label>
                <button
                  onClick={() => activate(group.key, group.rows.map((row) => row.id))}
                  disabled={!confirmed[group.key] || busy === group.key}
                  className="inline-flex h-7 items-center justify-center rounded-md bg-slate-900 px-2.5 text-[11px] font-bold text-white shadow-2xs transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {busy === group.key ? "Activating…" : "Activate in OmniRelay"}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      {notice && (
        <p className="mt-3 rounded-md bg-rose-50 border border-rose-200 p-2 text-xs font-semibold text-rose-800" role="status">
          {notice}
        </p>
      )}

      <footer className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200/70 bg-amber-50/50 p-2.5 text-xs text-amber-950">
        <b className="font-bold shrink-0 text-amber-800">Safety rule:</b>
        <span className="text-[11px] font-medium text-amber-900 leading-relaxed">
          “Configured” is not treated as proof of delivery. A green verification appears only after Meta accepts a message from the connected production sender.
        </span>
      </footer>
    </section>
  );
}
