import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

const allowedMimes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export async function POST(request: Request) {
  try {
    const { organization } = await getWorkspace();
    if (!organization) {
      return NextResponse.json({ error: "Organization required." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Please select a valid image or PDF file." }, { status: 400 });
    }

    if (!allowedMimes.has(file.type)) {
      return NextResponse.json({ error: "Only JPEG, PNG, WebP images and PDF documents are supported." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File size exceeds 10 MB limit." }, { status: 400 });
    }

    const admin = createAdminClient();
    let bucket = "creative-assets";

    // Ensure creative-assets allows PDF documents alongside images
    try {
      await admin.storage.updateBucket(bucket, {
        public: true,
        fileSizeLimit: 10485760,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"],
      });
    } catch {
      try {
        await admin.storage.createBucket(bucket, {
          public: true,
          fileSizeLimit: 10485760,
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"],
        });
      } catch {}
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${organization.id}/${Date.now()}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    // Resilient fallback: if creative-assets still has legacy restriction, store in clinic-brochures or clinical-documents
    if (uploadError && uploadError.message?.toLowerCase().includes("mime type")) {
      const fallbackBuckets = file.type === "application/pdf"
        ? ["clinic-brochures", "clinical-documents"]
        : ["clinical-documents", "clinic-brochures"];

      for (const fb of fallbackBuckets) {
        bucket = fb;
        const fallbackUpload = await admin.storage
          .from(bucket)
          .upload(storagePath, buffer, {
            contentType: file.type,
            upsert: true,
          });
        uploadError = fallbackUpload.error;
        if (!uploadError) break;
      }
    }

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    let fileUrl = "";
    if (bucket === "creative-assets") {
      const { data: publicData } = admin.storage.from(bucket).getPublicUrl(storagePath);
      fileUrl = publicData?.publicUrl || "";
    }

    // Fallback to signed URL if not public or in clinical-documents
    if (!fileUrl) {
      const { data: signedData } = await admin.storage.from(bucket).createSignedUrl(storagePath, 60 * 60 * 24 * 7);
      fileUrl = signedData?.signedUrl || "";
    }

    const mediaType = file.type === "application/pdf" ? "document" : "image";

    return NextResponse.json({
      ok: true,
      url: fileUrl,
      storagePath,
      storageBucket: bucket,
      fileName: file.name,
      fileSize: file.size,
      mediaType,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal upload error" }, { status: 500 });
  }
}
