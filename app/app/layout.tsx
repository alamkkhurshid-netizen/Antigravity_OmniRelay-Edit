import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { AppShell } from "@/components/app-shell";
import "../appointments-refresh.css";
import "../clinic-operations-refresh.css";
import "../conversations-refresh.css";
import "../conversations-jampack-refresh.css";
import "../conversations-layout-refactor.css";
import "../typography-polish.css";
import "../workspace-ux-system.css";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, organization, user, workspace } = await getWorkspace();
  if (!user) redirect("/login");

  // Parallelize operator check, invitations, notifications, profile, and alert refresh in one concurrent batch
  const [
    { data: isOperator },
    ,
    { count: unreadNotifications },
    { data: criticalNotifications },
    { data: recentNotifications },
    { data: whatsappRates },
    { data: profile }
  ] = await Promise.all([
    supabase.rpc("is_oem_operator"),
    supabase.rpc("accept_workspace_invitations"),
    supabase.from("app_notifications").select("id", { count: "exact", head: true }).eq("recipient_user_id", user.id).is("read_at", null),
    supabase.from("app_notifications").select("id,title,body,href,priority,escalation_level,created_at").eq("recipient_user_id", user.id).eq("notification_type", "serious_action").is("read_at", null).order("escalation_level",{ascending:false}).order("created_at", { ascending: false }).limit(5),
    supabase.from("app_notifications").select("id,title,body,href,priority,escalation_level,created_at").eq("recipient_user_id", user.id).is("read_at", null).order("created_at", { ascending: false }).limit(5),
    supabase.from("whatsapp_rate_cards").select("message_category,base_rate_paise,platform_fee_paise,source_version,verification_status").eq("channel","whatsapp").eq("country_code","IN").in("verification_status",["draft","verified"]),
    organization?.id
      ? supabase.from("onboarding_profiles").select("business_category").eq("organization_id", organization.id).maybeSingle()
      : Promise.resolve({ data: null }),
    organization?.id
      ? supabase.rpc("refresh_priority_action_alerts", { p_organization_id: organization.id })
      : Promise.resolve(null),
  ]);

  if (!workspace?.organization_id && !isOperator) redirect("/onboarding");

  const businessCategory =
    (profile?.business_category as string) ||
    (organization?.extra as { business_category?: string } | null)?.business_category ||
    "Healthcare";

  return (
    <AppShell
      email={user.email ?? "member"}
      isOperator={isOperator === true}
      businessCategory={businessCategory}
      unreadNotifications={unreadNotifications ?? 0}
      criticalNotifications={criticalNotifications ?? []}
      recentNotifications={recentNotifications ?? []}
      whatsappRates={whatsappRates ?? []}
    >
      {children}
    </AppShell>
  );
}

