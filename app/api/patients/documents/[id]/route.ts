import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  }
  const { id } = await params;
  const { data: document } = await supabase
    .from("patient_documents")
    .select("storage_bucket,storage_path")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const { data, error } = await supabase.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Document could not be opened." }, { status: 400 });
  }
  return NextResponse.redirect(data.signedUrl);
}
