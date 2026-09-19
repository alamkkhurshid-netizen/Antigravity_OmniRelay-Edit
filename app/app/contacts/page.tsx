import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { PatientDirectory } from "./patient-directory";

export default async function ContactsPage() {
  const {supabase,organization}=await getWorkspace();
  if(!organization)redirect("/onboarding");
  const {data:{user}}=await supabase.auth.getUser();
  const [{data:patients},{data:appointments},{data:encounters},{data:prescriptions},{data:documents},{data:consentEvents},{data:tasks},{data:carePlans},{data:carePlanReminders},{data:staff},{data:guardianLinks},{data:actor}]=await Promise.all([
    supabase.from("patient_profiles").select("id,full_name,phone,email,age,date_of_birth,primary_contact_phone,identity_status,health_concern,locality,pincode,patient_summary,care_communications_consent,marketing_consent,first_seen_at,last_seen_at,avatar_storage_path,avatar_updated_at").eq("organization_id",organization.id).order("last_seen_at",{ascending:false}),
    supabase.from("appointments").select("id,patient_id,starts_at,status,source,notes,health_concern,patient_summary,location:business_locations(name),service:organization_services(name),resource:booking_resources(name)").eq("organization_id",organization.id).order("starts_at",{ascending:false}),
    supabase.from("patient_encounters").select("id,patient_id,appointment_id,encounter_type,occurred_at,diagnosis,clinical_note,treatment_plan,follow_up_at,follow_up_status,created_at").eq("organization_id",organization.id).order("occurred_at",{ascending:false}),
    supabase.from("prescriptions").select("id,patient_id,encounter_id,appointment_id,prescription_number,issued_at,status,diagnosis,advice,tests_requested,follow_up_at,version,items:prescription_items(id,prescription_id,medicine_name,dosage,frequency,duration,instructions,sort_order)").eq("organization_id",organization.id).order("issued_at",{ascending:false}),
    supabase.from("patient_documents").select("id,patient_id,encounter_id,appointment_id,document_type,title,mime_type,file_size_bytes,created_at").eq("organization_id",organization.id).order("created_at",{ascending:false}),
    supabase.from("patient_consent_events").select("id,patient_id,consent_type,previous_status,new_status,source,captured_at,note").eq("organization_id",organization.id).order("captured_at",{ascending:false}),
    supabase.from("patient_care_tasks").select("id,patient_id,encounter_id,appointment_id,care_plan_id,task_type,title,details,due_at,priority,status,assigned_to,created_by,completed_by,completed_at,created_at,updated_at").eq("organization_id",organization.id).order("created_at",{ascending:false}),
    supabase.from("patient_care_plans").select("id,patient_id,encounter_id,plan_type,title,goal,instructions,status,starts_on,target_date,next_review_at,assigned_to,created_by,completed_by,completed_at,created_at,updated_at").eq("organization_id",organization.id).order("created_at",{ascending:false}),
    supabase.from("care_reminders").select("id,patient_id,care_plan_id,status,next_run_at,last_run_at").eq("organization_id",organization.id).not("care_plan_id","is",null),
    supabase.from("agents").select("user_id,name,extra").eq("organization_id",organization.id).eq("ai",false).not("user_id","is",null),
    supabase.from("patient_guardian_links").select("id,patient_id,guardian_name,guardian_phone,relationship,verification_status,verified_at,created_at,updated_at").eq("organization_id",organization.id).order("created_at",{ascending:true}),
    user?supabase.from("agents").select("extra").eq("organization_id",organization.id).eq("user_id",user.id).eq("ai",false).maybeSingle():Promise.resolve({data:null}),
  ]);
  const patientRows=await Promise.all((patients??[]).map(async(patient)=>{
    if(!patient.avatar_storage_path)return {...patient,avatar_url:null};
    const {data}=await supabase.storage.from("patient-avatars").createSignedUrl(patient.avatar_storage_path,3600);
    return {...patient,avatar_url:data?.signedUrl??null};
  }));
  const accessRole=String(actor?.extra?.role??"member");
  return <PatientDirectory patients={patientRows} appointments={appointments??[]} encounters={encounters??[]} prescriptions={prescriptions??[]} documents={documents??[]} consentEvents={consentEvents??[]} tasks={tasks??[]} carePlans={carePlans??[]} carePlanReminders={carePlanReminders??[]} staff={staff??[]} guardianLinks={guardianLinks??[]} canManageFamily={accessRole==="owner"||accessRole==="admin"} nowIso={new Date().toISOString()}/>;
}
