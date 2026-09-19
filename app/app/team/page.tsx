import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { TeamOperations } from "./team-operations";

export default async function TeamPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: members }, { data: tasks }, { data: patients }, { data: notifications }, { data: auditEvents }, { data: operationalEvents }] = await Promise.all([
    supabase.from("agents").select("id,user_id,name,picture,extra,created_at").eq("organization_id", organization.id).eq("ai", false).order("created_at"),
    supabase.from("patient_care_tasks").select("id,patient_id,care_plan_id,title,details,due_at,priority,status,assigned_to,created_at").eq("organization_id", organization.id).order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("patient_profiles").select("id,full_name").eq("organization_id", organization.id),
    supabase.from("app_notifications").select("id,notification_type,title,body,href,read_at,created_at").eq("organization_id", organization.id).eq("recipient_user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("team_audit_events").select("id,event_type,summary,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("operational_events").select("id,event_source,severity,error_code,safe_message,resolved_at,created_at").eq("organization_id", organization.id).is("resolved_at", null).order("created_at", { ascending: false }).limit(10),
  ]);
  const current = members?.find((member) => member.user_id === user.id);
  return <TeamOperations currentUserId={user.id} currentRole={String(current?.extra?.role ?? "member")} members={members ?? []} tasks={tasks ?? []} patients={patients ?? []} notifications={notifications ?? []} auditEvents={auditEvents ?? []} operationalEvents={operationalEvents ?? []} />;
}
