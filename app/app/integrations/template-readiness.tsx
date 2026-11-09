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
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
      {/* Light-shade banner header theme */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 bg-gradient-to-r from-sky-50/80 via-indigo-50/40 to-slate-50 px-5 py-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-teal-800">PRODUCTION TEMPLATE HEALTH</span>
          <h3 className="mt-0.5 text-base font-bold text-slate-900 leading-snug">Approval and real delivery are different checks</h3>
          <p className="mt-1 max-w-2xl text-xs font-medium text-slate-600 leading-relaxed">
            A template is ready only when its exact mapping is confirmed and Meta has accepted a live delivery from the currently connected WhatsApp account.
          </p>
        </div>
        <a
          href="https://business.facebook.com/wa/manage/message-templates/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition"
        >
          Open WhatsApp Manager ↗
        </a>
      </header>

      {/* Reframed square-shaped template blocks grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 p-4">
        {groups.map((group) => (
          <article
            className={`flex flex-col justify-between rounded-xl border p-3.5 shadow-2xs transition hover:border-slate-300 ${
              group.liveVerified
                ? "border-emerald-200/90 bg-emerald-50/30"
                : group.approved
                ? "border-sky-200/90 bg-sky-50/30"
                : "border-slate-200/80 bg-white"
            }`}
            key={group.key}
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold ${
                      group.liveVerified
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300/50"
                        : group.approved
                        ? "bg-sky-100 text-sky-800 border border-sky-300/50"
                        : "bg-amber-100 text-amber-800 border border-amber-300/50"
                    }`}
                  >
                    {group.liveVerified ? "✓" : group.approved ? "•" : "!"}
                  </span>
                  <b className="text-xs font-bold text-slate-900 leading-snug">{group.title}</b>
                </div>

                <strong
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold shrink-0 ${
                    group.liveVerified
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : group.approved
                      ? "bg-sky-50 text-sky-800 border border-sky-200"
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

              <p className="mt-2 text-[11px] font-medium text-slate-600 leading-snug">
                {group.description}
              </p>

              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-md bg-slate-100/80 px-2 py-1 text-[11px] font-mono text-slate-800 border border-slate-200/60">
                <span className="text-[10px] text-slate-500 font-sans uppercase font-bold tracking-wider">Template</span>
                <span className="truncate">{group.templateName}</span>
              </div>

              {group.variables.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {group.variables.map(([position, name]) => (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200/80 shadow-2xs capitalize"
                      key={position}
                    >
                      <code className="text-[9px] font-bold text-teal-700">{`{{${position}}}`}</code>
                      {name.replaceAll("_", " ")}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-medium text-slate-600">
                <div className="flex items-center gap-2">
                  <span><b className="text-slate-900 font-bold">{group.queued}</b> queued</span>
                  <span className="text-slate-300">·</span>
                  <span><b className="text-slate-900 font-bold">{group.failed}</b> failed</span>
                </div>
              </div>

              {!group.approved && (
                <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-2 text-xs">
                  <label className="flex items-start gap-1.5 cursor-pointer text-[10px] font-medium text-amber-950">
                    <input
                      type="checkbox"
                      className="size-3.5 mt-0.5 rounded border-amber-300 text-teal-600"
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
                    className="mt-2 w-full inline-flex h-7.5 items-center justify-center rounded-md bg-slate-900 px-2.5 text-[11px] font-bold text-white shadow-2xs transition hover:bg-slate-800 disabled:opacity-40"
                  >
                    {busy === group.key ? "Activating…" : "Activate in OmniRelay"}
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {notice && (
        <p className="mx-4 mb-3 rounded-md bg-rose-50 border border-rose-200 p-2 text-xs font-semibold text-rose-800" role="status">
          {notice}
        </p>
      )}

      <footer className="flex items-start gap-2 border-t border-slate-100 bg-amber-50/40 px-4 py-2.5 text-xs text-amber-950">
        <b className="font-bold shrink-0 text-amber-800">Safety rule:</b>
        <span className="text-[11px] font-medium text-amber-900 leading-relaxed">
          “Configured” is not treated as proof of delivery. A green verification appears only after Meta accepts a message from the connected production sender.
        </span>
      </footer>
    </section>
  );
}
