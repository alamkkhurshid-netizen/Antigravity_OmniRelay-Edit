import { createClient } from "@/lib/supabase/server";

export async function getWorkspace() {
  const supabase = await createClient();
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id,name,extra,created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  return { supabase, organization: organizations?.[0] ?? null };
}
