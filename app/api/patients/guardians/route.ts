import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

const relationships = new Set(["child", "parent", "spouse", "relative", "other"]);
const guardianSelect = "id,patient_id,guardian_name,guardian_phone,relationship,verification_status,verified_at,created_at,updated_at";
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

async function context() {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !organization) return { supabase, organization, user, canManage: false };
  const { data: actor } = await supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).eq("ai", false).maybeSingle();
  const role = String(actor?.extra?.role ?? "member");
  return { supabase, organization, user, canManage: role === "owner" || role === "admin" };
}

export async function POST(request: Request) {
  const { supabase, organization, user, canManage } = await context();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  if (!canManage) return NextResponse.json({ error: "Only workspace administrators can manage household contacts." }, { status: 403 });

  const payload = await request.json().catch(() => ({})) as { patientId?: string; guardianName?: string; guardianPhone?: string; relationship?: string; staffVerified?: boolean };
  const patientId = clean(payload.patientId);
  const guardianName = clean(payload.guardianName);
  const guardianPhone = clean(payload.guardianPhone);
  const relationship = clean(payload.relationship);
  const normalizedPhone = guardianPhone.replace(/[^0-9]/g, "");
  if (!patientId || guardianName.length < 2 || guardianName.length > 120) return NextResponse.json({ error: "Enter a valid contact name." }, { status: 400 });
  if (normalizedPhone.length < 10 || normalizedPhone.length > 15) return NextResponse.json({ error: "Enter a valid mobile number with country code." }, { status: 400 });
  if (!relationships.has(relationship)) return NextResponse.json({ error: "Choose a valid relationship." }, { status: 400 });
  const { data: patient } = await supabase.from("patient_profiles").select("id").eq("id", patientId).eq("organization_id", organization.id).maybeSingle();
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  const verificationStatus = payload.staffVerified ? "staff_verified" : "unverified";
  const { data: existingLinks, error: lookupError } = await supabase
    .from("patient_guardian_links")
    .select("id,guardian_phone")
    .eq("organization_id", organization.id)
    .eq("patient_id", patientId);
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 400 });
  const existing = existingLinks?.find((link) => String(link.guardian_phone ?? "").replace(/[^0-9]/g, "") === normalizedPhone);
  const values = {
    organization_id: organization.id,
    patient_id: patientId,
    guardian_name: guardianName,
    guardian_phone: normalizedPhone,
    relationship,
    verification_status: verificationStatus,
    verified_at: payload.staffVerified ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const query = existing
    ? supabase.from("patient_guardian_links").update(values).eq("id", existing.id).eq("organization_id", organization.id)
    : supabase.from("patient_guardian_links").insert(values);
  const { data: guardian, error } = await query.select(guardianSelect).single();
  if (error || !guardian) return NextResponse.json({ error: error?.message ?? "Booking contact could not be saved." }, { status: 400 });
  return NextResponse.json({ guardian });
}

export async function DELETE(request: Request) {
  const { supabase, organization, user, canManage } = await context();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  if (!canManage) return NextResponse.json({ error: "Only workspace administrators can manage household contacts." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Booking contact is required." }, { status: 400 });
  const { error } = await supabase.from("patient_guardian_links").delete().eq("id", id).eq("organization_id", organization.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ deleted: true });
}
