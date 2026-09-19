import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { CarePlanOperations } from "./care-plan-operations";

export default async function CarePlansPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: plans }, { data: patients }, { data: reminders }, { data: tasks }, { data: staff }, { data: actor }] = await Promise.all([
    supabase.from("patient_care_plans").select("id,patient_id,plan_type,title,goal,instructions,status,starts_on,target_date,next_review_at,assigned_to,created_at,updated_at").eq("organization_id", organization.id).order("next_review_at", { ascending: true, nullsFirst: false }),
    supabase.from("patient_profiles").select("id,full_name,phone,health_concern,care_communications_consent,last_seen_at").eq("organization_id", organization.id),
    supabase.from("care_reminders").select("id,care_plan_id,status,next_run_at,last_run_at").eq("organization_id", organization.id).not("care_plan_id", "is", null),
    supabase.from("patient_care_tasks").select("id,care_plan_id,status,due_at,priority,assigned_to").eq("organization_id", organization.id).not("care_plan_id", "is", null),
    supabase.from("agents").select("user_id,name").eq("organization_id", organization.id).eq("ai", false).not("user_id", "is", null),
    supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).eq("ai", false).maybeSingle(),
  ]);

  const accessRole = String(actor?.extra?.role ?? "member");
  return <CarePlanOperations plans={plans ?? []} patients={patients ?? []} reminders={reminders ?? []} tasks={tasks ?? []} staff={staff ?? []} canManage={accessRole === "owner" || accessRole === "admin"} nowIso={new Date().toISOString()} />;
}
