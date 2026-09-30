import { createClient } from "@/lib/supabase/server";

export async function getWorkspace() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, organization: null };
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("ai", false)
    .limit(1)
    .maybeSingle();

  if (!agent?.organization_id) {
    return { supabase, organization: null };
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id,name,extra,created_at")
    .eq("id", agent.organization_id)
    .maybeSingle();

  return { supabase, organization };
}
