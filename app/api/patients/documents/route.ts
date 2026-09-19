import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const allowedDocumentTypes = new Set([
  "prescription",
  "lab_report",
  "imaging",
  "referral",
  "consent",
  "other",
]);

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const patientId = String(form.get("patientId") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const documentType = String(form.get("documentType") ?? "other").trim();
  const encounterId = String(form.get("encounterId") ?? "").trim() || null;
  const appointmentId = String(form.get("appointmentId") ?? "").trim() || null;

  if (!(file instanceof File) || !patientId || !title) {
    return NextResponse.json({ error: "Patient, title and file are required." }, { status: 400 });
  }
  if (!allowedTypes.has(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Upload a PDF, JPEG, PNG or WebP file up to 10 MB." },
      { status: 400 },
    );
  }
  if (!allowedDocumentTypes.has(documentType)) {
    return NextResponse.json({ error: "Invalid document type." }, { status: 400 });
  }

  const { data: patient } = await supabase
    .from("patient_profiles")
    .select("id")
    .eq("id", patientId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
  const path = `${organization.id}/${patientId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("clinical-documents")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: document, error: documentError } = await supabase
    .from("patient_documents")
    .insert({
      organization_id: organization.id,
      patient_id: patientId,
      encounter_id: encounterId,
      appointment_id: appointmentId,
      document_type: documentType,
      title,
      storage_bucket: "clinical-documents",
      storage_path: path,
      mime_type: file.type,
      file_size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select("id,patient_id,encounter_id,appointment_id,document_type,title,mime_type,file_size_bytes,created_at")
    .single();

  if (documentError || !document) {
    await supabase.storage.from("clinical-documents").remove([path]);
    return NextResponse.json(
      { error: documentError?.message ?? "Document record could not be saved." },
      { status: 400 },
    );
  }
  return NextResponse.json({ document });
}
