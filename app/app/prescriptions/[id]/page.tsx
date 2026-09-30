import { notFound, redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { Brand } from "@/components/brand";
import { PrintButton } from "./print-button";

export default async function PrescriptionPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const {supabase,organization}=await getWorkspace();
  if(!organization)redirect("/login");
  const [{data:prescription},{data:profile},{data:business}]=await Promise.all([
    supabase.from("prescriptions").select("id,patient_id,prescription_number,issued_at,status,diagnosis,advice,tests_requested,follow_up_at,version,items:prescription_items(medicine_name,dosage,frequency,duration,instructions,sort_order),patient:patient_profiles(full_name,phone,email,age,locality,pincode)").eq("id",id).eq("organization_id",organization.id).maybeSingle(),
    supabase.from("onboarding_profiles").select("business_name").eq("organization_id",organization.id).maybeSingle(),
    supabase.from("booking_resources").select("name").eq("organization_id",organization.id).eq("active",true).order("created_at").limit(1).maybeSingle(),
  ]);
  if(!prescription)notFound();
  const patient=Array.isArray(prescription.patient)?prescription.patient[0]:prescription.patient;
  const items=[...(prescription.items??[])].sort((a,b)=>a.sort_order-b.sort_order);
  return <main className="rx-page">
    <header className="rx-toolbar"><Brand/><div><a href="/app/contacts">Back to patients</a><PrintButton/></div></header>
    <article className="rx-sheet">
      <header><div><span>OMNIRELAY DIGITAL PRESCRIPTION</span><h1>{profile?.business_name||organization.name}</h1><p>{business?.name||"Primary provider"}</p></div><div><b>{prescription.prescription_number}</b><time>{new Intl.DateTimeFormat("en-IN",{dateStyle:"long",timeZone:"Asia/Kolkata"}).format(new Date(prescription.issued_at))}</time></div></header>
      <section className="rx-patient"><div><span>Patient</span><b>{patient?.full_name}</b></div><div><span>Age</span><b>{patient?.age!=null?`${patient.age} years`:"—"}</b></div><div><span>Mobile</span><b>{patient?.phone||"—"}</b></div><div><span>Location</span><b>{[patient?.locality,patient?.pincode].filter(Boolean).join(" · ")||"—"}</b></div></section>
      {prescription.diagnosis&&<section className="rx-diagnosis"><span>Assessment / diagnosis</span><p>{prescription.diagnosis}</p></section>}
      <section className="rx-medicines">
        <h2>Rx</h2>
        <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_2fr] gap-4 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-500 sm:grid">
          <div>Medicine</div>
          <div>Dose</div>
          <div>Frequency</div>
          <div>Duration</div>
          <div>Instructions</div>
        </div>
        <div className="flex flex-col gap-4 pt-2 sm:gap-2 sm:pt-0">
          {items.map((item)=>(
            <div key={`${item.sort_order}-${item.medicine_name}`} className="grid grid-cols-1 gap-1 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_2fr] sm:gap-4 sm:border-none sm:bg-transparent sm:p-2 sm:px-0">
              <div className="font-bold sm:font-normal"><span className="text-xs font-semibold text-slate-400 sm:hidden">Medicine: </span>{item.medicine_name}</div>
              <div><span className="text-xs font-semibold text-slate-400 sm:hidden">Dose: </span>{item.dosage||"—"}</div>
              <div><span className="text-xs font-semibold text-slate-400 sm:hidden">Freq: </span>{item.frequency}</div>
              <div><span className="text-xs font-semibold text-slate-400 sm:hidden">Dur: </span>{item.duration||"—"}</div>
              <div className="text-sm italic text-slate-600 sm:not-italic sm:text-black"><span className="text-xs font-semibold text-slate-400 sm:hidden">Inst: </span>{item.instructions||"—"}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="rx-notes">{prescription.tests_requested&&<div><span>Tests requested</span><p>{prescription.tests_requested}</p></div>}{prescription.advice&&<div><span>Advice</span><p>{prescription.advice}</p></div>}{prescription.follow_up_at&&<div><span>Follow-up</span><p>{new Intl.DateTimeFormat("en-IN",{dateStyle:"long",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(new Date(prescription.follow_up_at))}</p></div>}</section>
      <footer><div><span>Issued digitally</span><small>Version {prescription.version} · Clinical records are access-controlled within OmniRelay.</small></div><div><b>{business?.name||"Primary provider"}</b><span>Authorised clinician</span></div></footer>
    </article>
  </main>;
}
