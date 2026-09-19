import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const bucket = "patient-avatars";

async function context() {
  const workspace = await getWorkspace();
  const { data: { user } } = await workspace.supabase.auth.getUser();
  return { ...workspace, user };
}

export async function POST(request: Request) {
  const { supabase, organization, user } = await context();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const form = await request.formData();
  const file = form.get("file");
  const patientId = String(form.get("patientId") ?? "").trim();
  if (!(file instanceof File) || !patientId) {
    return NextResponse.json({ error: "Patient and photo are required." }, { status: 400 });
  }
  const extension = allowedTypes.get(file.type);
  if (!extension || file.size <= 0 || file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Upload a JPEG, PNG or WebP photo up to 2 MB." }, { status: 400 });
  }

  const { data: patient } = await supabase.from("patient_profiles")
    .select("id,avatar_storage_path").eq("id", patientId)
    .eq("organization_id", organization.id).maybeSingle();
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  const path = `${organization.id}/${patientId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

  const avatarUpdatedAt = new Date().toISOString();
  const { error: updateError } = await supabase.from("patient_profiles")
    .update({ avatar_storage_path: path, avatar_updated_at: avatarUpdatedAt })
    .eq("id", patientId).eq("organization_id", organization.id);
  if (updateError) {
    await supabase.storage.from(bucket).remove([path]);
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }
  if (patient.avatar_storage_path && patient.avatar_storage_path !== path) {
    await supabase.storage.from(bucket).remove([patient.avatar_storage_path]);
  }
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return NextResponse.json({ avatarStoragePath: path, avatarUpdatedAt, avatarUrl: signed?.signedUrl ?? null });
}

export async function DELETE(request: Request) {
  const { supabase, organization, user } = await context();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const payload = await request.json().catch(() => ({})) as { patientId?: string };
  const patientId = String(payload.patientId ?? "").trim();
  const { data: patient } = await supabase.from("patient_profiles")
    .select("id,avatar_storage_path").eq("id", patientId)
    .eq("organization_id", organization.id).maybeSingle();
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  const { error } = await supabase.from("patient_profiles")
    .update({ avatar_storage_path: null, avatar_updated_at: null })
    .eq("id", patientId).eq("organization_id", organization.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (patient.avatar_storage_path) await supabase.storage.from(bucket).remove([patient.avatar_storage_path]);
  return NextResponse.json({ ok: true });
}
