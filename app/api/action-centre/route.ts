import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

export async function POST() {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const { data, error } = await supabase.rpc("deploy_due_clinic_actions", {
    p_organization_id: organization.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ deployment: data });
}
