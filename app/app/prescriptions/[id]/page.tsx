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
      <section className="rx-medicines"><h2>Rx</h2><table><thead><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead><tbody>{items.map((item)=><tr key={`${item.sort_order}-${item.medicine_name}`}><td>{item.medicine_name}</td><td>{item.dosage||"—"}</td><td>{item.frequency}</td><td>{item.duration||"—"}</td><td>{item.instructions||"—"}</td></tr>)}</tbody></table></section>
      <section className="rx-notes">{prescription.tests_requested&&<div><span>Tests requested</span><p>{prescription.tests_requested}</p></div>}{prescription.advice&&<div><span>Advice</span><p>{prescription.advice}</p></div>}{prescription.follow_up_at&&<div><span>Follow-up</span><p>{new Intl.DateTimeFormat("en-IN",{dateStyle:"long",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(new Date(prescription.follow_up_at))}</p></div>}</section>
      <footer><div><span>Issued digitally</span><small>Version {prescription.version} · Clinical records are access-controlled within OmniRelay.</small></div><div><b>{business?.name||"Primary provider"}</b><span>Authorised clinician</span></div></footer>
    </article>
  </main>;
}
