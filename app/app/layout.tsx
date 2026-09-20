import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import "../appointments-refresh.css";
import "../clinic-operations-refresh.css";
import "../conversations-refresh.css";
import "../conversations-jampack-refresh.css";
import "../conversations-layout-refactor.css";
import "../typography-polish.css";
import "../workspace-ux-system.css";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isOperator } = await supabase.rpc("is_oem_operator");
  await supabase.rpc("accept_workspace_invitations");
  const {data:workspace}=await supabase.from("agents").select("organization_id").eq("user_id",user.id).eq("ai",false).limit(1).maybeSingle();
  if (!workspace?.organization_id && !isOperator) redirect("/onboarding");
  if(workspace?.organization_id)await supabase.rpc("refresh_priority_action_alerts",{p_organization_id:workspace.organization_id});
  const [{ count: unreadNotifications }, { data: criticalNotifications }, { data: recentNotifications }, { data: whatsappRates }] = await Promise.all([
    supabase.from("app_notifications").select("id", { count: "exact", head: true }).eq("recipient_user_id", user.id).is("read_at", null),
    supabase.from("app_notifications").select("id,title,body,href,priority,escalation_level,created_at").eq("recipient_user_id", user.id).eq("notification_type", "serious_action").is("read_at", null).order("escalation_level",{ascending:false}).order("created_at", { ascending: false }).limit(5),
    supabase.from("app_notifications").select("id,title,body,href,priority,escalation_level,created_at").eq("recipient_user_id", user.id).is("read_at", null).order("created_at", { ascending: false }).limit(5),
    supabase.from("whatsapp_rate_cards").select("message_category,base_rate_paise,platform_fee_paise,source_version,verification_status").eq("channel","whatsapp").eq("country_code","IN").in("verification_status",["draft","verified"]),
  ]);

  return <AppShell email={user.email ?? "member"} isOperator={isOperator === true} unreadNotifications={unreadNotifications ?? 0} criticalNotifications={criticalNotifications ?? []} recentNotifications={recentNotifications ?? []} whatsappRates={whatsappRates ?? []}>{children}</AppShell>;
}
