"use client";
import { useState } from "react";

export type SecurityIncident = { id:string; reference:string; severity:string; category:string; status:string; title:string; safe_summary:string; containment_summary:string|null; resolution_summary:string|null; created_at:string; updated_at:string };

export function IncidentControl({ initialIncidents, canManage }: { initialIncidents: SecurityIncident[]; canManage: boolean }) {
  const [incidents,setIncidents]=useState(initialIncidents); const [open,setOpen]=useState(false); const [busy,setBusy]=useState(""); const [message,setMessage]=useState(""); const [error,setError]=useState("");
  const [form,setForm]=useState({title:"",safeSummary:"",severity:"medium",category:"service_outage"});
  async function createIncident(event:React.FormEvent){event.preventDefault();setBusy("create");setError("");setMessage("");const response=await fetch("/api/operations/incidents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const result=await response.json();setBusy("");if(!response.ok){setError(result.error??"Incident could not be created.");return}setIncidents(current=>[result.incident,...current]);setOpen(false);setForm({title:"",safeSummary:"",severity:"medium",category:"service_outage"});setMessage(`${result.incident.reference} opened and assigned.`)}
  async function updateIncident(incident:SecurityIncident,status:string){const resolutionSummary=["resolved","closed"].includes(status)?window.prompt("Add a safe resolution summary. Do not include patient names or medical details.")?.trim():undefined;const containmentSummary=status==="contained"?window.prompt("Add a safe containment summary. Do not include patient names or medical details.")?.trim():undefined;if(["resolved","closed"].includes(status)&&!resolutionSummary)return;if(status==="contained"&&!containmentSummary)return;setBusy(incident.id);setError("");setMessage("");const response=await fetch("/api/operations/incidents",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:incident.id,status,resolutionSummary,containmentSummary})});const result=await response.json();setBusy("");if(!response.ok){setError(result.error??"Incident could not be updated.");return}setIncidents(current=>current.map(item=>item.id===incident.id?result.incident:item));setMessage(`${result.incident.reference} moved to ${result.incident.status}.`)}
  const active=incidents.filter(item=>!["resolved","closed"].includes(item.status));
  
  return <section className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm mt-6">
    <header className="flex flex-col md:flex-row md:items-start justify-between mb-6 border-b border-slate-100 pb-4">
      <div>
        <span className="or-type-label text-[#1688d5] block mb-2">PILOT GOVERNANCE</span>
        <h3 className="or-type-section text-slate-900 mb-1">Security incident register</h3>
        <p className="text-[13px] text-slate-500 max-w-xl">Record operational and security events without patient names, phone numbers or medical content.</p>
      </div>
      {canManage && <button onClick={()=>setOpen(!open)} className="mt-4 md:mt-0 px-4 py-2 bg-slate-900 text-white text-[13px] font-bold rounded-lg hover:bg-slate-800 transition-colors">{open ? "Cancel" : "Open incident"}</button>}
    </header>
    
    {message && <p className="mb-6 p-3 bg-teal-50 text-teal-700 text-[13px] font-medium rounded-lg border border-teal-100" role="status">✓ {message}</p>}
    {error && <p className="mb-6 p-3 bg-red-50 text-red-700 text-[13px] font-medium rounded-lg border border-red-100" role="alert">{error}</p>}
    
    {open && <form className="flex flex-col gap-4 p-5 bg-slate-50 border border-slate-200 rounded-xl mb-6" onSubmit={createIncident}>
      <label className="flex flex-col text-[13px] font-bold text-slate-700 gap-1.5">
        Safe title
        <input required minLength={5} maxLength={160} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Example: WhatsApp delivery interruption" className="px-3 py-2 border border-slate-300 rounded-md font-normal focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"/>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col text-[13px] font-bold text-slate-700 gap-1.5">
          Severity
          <select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})} className="px-3 py-2 border border-slate-300 rounded-md font-normal bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className="flex flex-col text-[13px] font-bold text-slate-700 gap-1.5">
          Category
          <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="px-3 py-2 border border-slate-300 rounded-md font-normal bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
            <option value="service_outage">Service outage</option>
            <option value="provider_failure">Provider failure</option>
            <option value="suspicious_activity">Suspicious activity</option>
            <option value="unauthorized_access">Unauthorized access</option>
            <option value="credential_compromise">Credential compromise</option>
            <option value="data_exposure">Data exposure</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col text-[13px] font-bold text-slate-700 gap-1.5">
        Safe summary
        <textarea required minLength={5} maxLength={1000} value={form.safeSummary} onChange={e=>setForm({...form,safeSummary:e.target.value})} placeholder="Describe impact and immediate action without patient-identifying information." className="px-3 py-2 border border-slate-300 rounded-md font-normal min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"/>
      </label>
      <button disabled={busy==="create"} className="self-end px-5 py-2 bg-blue-600 text-white text-[13px] font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors mt-2">{busy==="create" ? "Opening…" : "Open and assign to me"}</button>
    </form>}
    
    {active.length ? <div className="flex flex-col gap-3">
      {active.map(incident => <article key={incident.id} className={`flex flex-col lg:flex-row lg:items-center justify-between p-5 rounded-xl border gap-4 ${incident.severity === 'critical' ? 'bg-red-50/50 border-red-200' : incident.severity === 'high' ? 'bg-orange-50/50 border-orange-200' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className="flex flex-col">
          <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500 mb-1 flex items-center gap-2">
            <span className="font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{incident.reference}</span>
            <span className={`px-2 py-0.5 rounded-full ${incident.severity === 'critical' ? 'bg-red-100 text-red-700' : incident.severity === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>{incident.severity}</span>
          </span>
          <b className="text-[16px] text-slate-900 mb-1">{incident.title}</b>
          <small className="text-[13px] text-slate-500 max-w-2xl">{incident.safe_summary}</small>
        </div>
        <div className="flex flex-col lg:items-end gap-3 mt-2 lg:mt-0">
          <em className="text-[13px] font-medium px-3 py-1 bg-blue-50 text-blue-700 rounded-full not-italic capitalize self-start lg:self-auto">{incident.status.replace('_', ' ')}</em>
          {canManage && <nav className="flex gap-2">
            {incident.status === "open" && <button disabled={busy===incident.id} onClick={()=>updateIncident(incident,"contained")} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-[12px] font-bold rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors">Contain</button>}
            {incident.status === "contained" && <button disabled={busy===incident.id} onClick={()=>updateIncident(incident,"monitoring")} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-[12px] font-bold rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors">Monitor</button>}
            <button disabled={busy===incident.id} onClick={()=>updateIncident(incident,"resolved")} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-[12px] font-bold rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors">Resolve</button>
          </nav>}
        </div>
      </article>)}
    </div> : <div className="flex flex-col items-center justify-center py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
      <i className="w-12 h-12 rounded-full bg-teal-50 text-teal-500 flex items-center justify-center not-italic text-xl font-bold mb-4">✓</i>
      <b className="text-[15px] text-slate-800">No active security incidents</b>
      <span className="text-[13px] text-slate-500 mt-1">The clinic pilot has no open incident records.</span>
    </div>}
  </section>;
}
