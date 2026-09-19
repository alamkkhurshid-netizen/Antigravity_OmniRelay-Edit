import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

export async function POST() {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Complete business onboarding first." }, { status: 409 });

  // Connecting a business phone number is an ownership-level action. Do not
  // allow ordinary staff to create a Meta authorization session that could be
  // completed in a different browser window.
  const { data: actor } = await supabase
    .from("agents")
    .select("extra")
    .eq("organization_id", organization.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (String((actor?.extra as { role?: string } | null)?.role ?? "member") !== "owner") {
    return NextResponse.json({ error: "Only the workspace owner can connect WhatsApp Business." }, { status: 403 });
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("onboarding_tokens")
    .insert({
      organization_id: organization.id,
      name: `OmniRelay embedded signup ${new Date().toISOString()}`,
      service: "whatsapp",
      expires_at: expiresAt,
      status: "active",
    })
    .select("id,expires_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not start the secure connection session." }, { status: 400 });
  }
  return NextResponse.json({ token: data.id, expiresAt: data.expires_at });
}
