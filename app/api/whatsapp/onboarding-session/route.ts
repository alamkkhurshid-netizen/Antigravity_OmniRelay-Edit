import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

const STAGING_PROJECT_REF = "sqcprlkhsnfbydgzpsml";
const STAGING_CALLBACK_URL = `https://${STAGING_PROJECT_REF}.supabase.co/functions/v1/whatsapp-webhook`;

export async function POST() {
  // 4. Fail closed unless the target environment and Supabase project are explicitly staging.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const targetEnv = (process.env.TARGET_ENV || process.env.VERCEL_ENV || "").toLowerCase();
  const isProduction = process.env.VERCEL_ENV === "production" || targetEnv === "production";
  const isStagingProject = supabaseUrl.includes(STAGING_PROJECT_REF);
  const isStagingEnv = targetEnv === "staging" || targetEnv === "preview";

  if (!isStagingProject || !isStagingEnv || isProduction) {
    return NextResponse.json(
      { error: "WhatsApp onboarding is strictly restricted to the staging environment." },
      { status: 403 }
    );
  }

  // 2. Retrieve server-controlled staging verification token.
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;
  if (!verifyToken) {
    return NextResponse.json(
      { error: "Staging WhatsApp verification token is not configured on the server." },
      { status: 500 }
    );
  }

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

  // 1 & 3. Store server-controlled staging callback and verify token. Never accept either from browser.
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("onboarding_tokens")
    .insert({
      organization_id: organization.id,
      name: `OmniRelay embedded signup ${new Date().toISOString()}`,
      service: "whatsapp",
      callback_url: STAGING_CALLBACK_URL,
      verify_token: verifyToken,
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

