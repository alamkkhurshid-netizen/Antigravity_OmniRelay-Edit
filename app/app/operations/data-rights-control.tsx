"use client";
import {useState} from "react";
export type DataRightRequest={id:string;reference:string;request_type:string;status:string;request_summary:string;identity_method:string;identity_verified_at:string;retention_review:string;retention_reason:string|null;decision_summary:string|null;created_at:string;updated_at:string;patient_profiles:{full_name:string}|{full_name:string}[]|null};
export function DataRightsControl({initialRequests,canManage}:{initialRequests:DataRightRequest[];canManage:boolean}){
  const [items,setItems]=useState(initialRequests);
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function update(item:DataRightRequest,status:string){
    let retentionReview=item.retention_review,retentionReason=item.retention_reason??undefined,decisionSummary=item.decision_summary??undefined;
    if(["approved","processing","completed"].includes(status)&&retentionReview==="pending"){
      retentionReview=window.prompt("Retention result: eligible, retain_partial, or retain_full","eligible")?.trim()??"";
      if(!["eligible","retain_partial","retain_full"].includes(retentionReview))return;
      retentionReason=window.prompt("Document the retention reason.")?.trim();
      if(!retentionReason)return;
    }
    if(["completed","rejected"].includes(status)){
      decisionSummary=window.prompt("Document the final decision and action.")?.trim();
      if(!decisionSummary)return;
    }
    setBusy(item.id);setError("");
    const response=await fetch("/api/operations/data-requests",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:item.id,status,retentionReview,retentionReason,decisionSummary})});
    const body=await response.json();
    setBusy("");
    if(!response.ok){setError(body.error??"Request could not be updated.");return}
    setItems(c=>c.map(x=>x.id===item.id?body.request:x));
    setMessage(`${body.request.reference} moved to ${body.request.status}.`);
  }

  const active=items.filter(x=>!["completed","rejected","cancelled"].includes(x.status));

  return <section className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm mt-6">
    <header className="flex flex-col md:flex-row md:items-center justify-between mb-6 border-b border-slate-100 pb-4">
      <div>
        <span className="or-type-label text-[#1688d5] block mb-2">PATIENT PRIVACY</span>
        <h3 className="or-type-section text-slate-900 mb-1">Data-rights request queue</h3>
        <p className="text-[13px] text-slate-500 max-w-xl">Verify, review and document each request. Erasure never runs automatically.</p>
      </div>
      <span className="mt-4 md:mt-0 text-[13px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">{active.length} active</span>
    </header>
    
    {message && <p className="mb-6 p-3 bg-teal-50 text-teal-700 text-[13px] font-medium rounded-lg border border-teal-100">✓ {message}</p>}
    {error && <p className="mb-6 p-3 bg-red-50 text-red-700 text-[13px] font-medium rounded-lg border border-red-100">{error}</p>}
    
    {active.length ? <div className="flex flex-col gap-3">
      {active.map(item => {
        const patient=Array.isArray(item.patient_profiles)?item.patient_profiles[0]:item.patient_profiles;
        return <article key={item.id} className="flex flex-col lg:flex-row lg:items-center justify-between p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-blue-200 transition-colors gap-4">
          <div className="flex flex-col">
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1 flex items-center gap-2">
              <span className="font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{item.reference}</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{item.request_type.replaceAll("_"," ")}</span>
            </span>
            <b className="text-[16px] text-slate-900 mb-1">{patient?.full_name??"Patient"}</b>
            <small className="text-[13px] text-slate-500 max-w-2xl mb-1">{item.request_summary}</small>
            <em className="text-[12px] not-italic text-slate-400 font-medium">Identity: {item.identity_method.replaceAll("_"," ")}</em>
          </div>
          <div className="flex flex-col lg:items-end gap-3 mt-2 lg:mt-0">
            <strong className="text-[13px] font-bold text-slate-700 capitalize self-start lg:self-auto">{item.status.replaceAll("_"," ")}</strong>
            {canManage && <nav className="flex flex-wrap gap-2">
              {item.status==="submitted" && <button disabled={busy===item.id} onClick={()=>update(item,"identity_verified")} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-[12px] font-bold rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors">Verify identity</button>}
              {item.status==="identity_verified" && <button disabled={busy===item.id} onClick={()=>update(item,"under_review")} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-[12px] font-bold rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors">Start review</button>}
              {item.status==="under_review" && <button disabled={busy===item.id} onClick={()=>update(item,"approved")} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-[12px] font-bold rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors">Approve</button>}
              {item.status==="approved" && <button disabled={busy===item.id} onClick={()=>update(item,"processing")} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-[12px] font-bold rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors">Process</button>}
              {item.status==="processing" && <button disabled={busy===item.id} onClick={()=>update(item,"completed")} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-[12px] font-bold rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors">Complete</button>}
              <button disabled={busy===item.id} onClick={()=>update(item,"rejected")} className="px-3 py-1.5 bg-red-50 border border-red-100 text-red-700 text-[12px] font-bold rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors">Reject</button>
            </nav>}
          </div>
        </article>
      })}
    </div> : <div className="flex flex-col items-center justify-center py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
      <i className="w-12 h-12 rounded-full bg-teal-50 text-teal-500 flex items-center justify-center not-italic text-xl font-bold mb-4">✓</i>
      <b className="text-[15px] text-slate-800">No active data requests</b>
      <span className="text-[13px] text-slate-500 mt-1">New verified patient requests will appear here.</span>
    </div>}
  </section>;
}
