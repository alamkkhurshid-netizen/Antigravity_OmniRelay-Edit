import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect("/login");
  }

  // Attempt to find any active workspace for the user to bypass onboarding blocks
  const { data: workspace } = await supabase
    .from("agents")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  // If no workspace is found, we could redirect to /onboarding, but to keep
  // the app shell accessible for this demo, we'll let it pass through.
  
  return (
    <AppShell email={user.email ?? "member"}>
      {children}
    </AppShell>
  );
}
