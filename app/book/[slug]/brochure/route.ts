import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const escapePdf = (value: unknown) => String(value ?? "").replace(/[\\()]/g, "\\$&").replace(/[\r\n]+/g, " ").slice(0, 110);

function createPdf(lines: string[]) {
  const content = ["BT", "/F1 18 Tf", "50 780 Td", `(${escapePdf(lines[0] ?? "Clinic directory")}) Tj`, "/F1 10 Tf", "0 -28 Td", ...lines.slice(1, 40).flatMap((line) => [`(${escapePdf(line)}) Tj`, "0 -16 Td"]), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_booking_page", { p_slug: slug });
  if (error || !data) return new Response("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: page } = await admin.from("booking_pages").select("organization_id").eq("slug", String(slug).toLowerCase()).eq("active", true).maybeSingle();
  const { data: profile } = page ? await admin.from("onboarding_profiles").select("custom_brochure_url,custom_brochure_storage_path").eq("organization_id", page.organization_id).maybeSingle() : { data: null };
  const customUrl = String(profile?.custom_brochure_url ?? "").trim();
  if (/^https:\/\/[^\s]+$/i.test(customUrl)) return Response.redirect(customUrl, 302);
  const customPath = String(profile?.custom_brochure_storage_path ?? "").trim();
  if (page && customPath.startsWith(`${page.organization_id}/`)) {
    const { data: signed } = await admin.storage.from("clinic-brochures").createSignedUrl(customPath, 300, { download: `${String(slug).replace(/[^a-z0-9-]/gi, "-")}-clinic-brochure.pdf` });
    if (signed?.signedUrl) return Response.redirect(signed.signedUrl, 302);
  }

  const business = data.business ?? {};
  const lines = [
    `${business.name ?? "Clinic"} — Doctor Directory & Brochure`,
    "Public clinic information",
    "",
    "DOCTORS",
    ...((data.resources ?? []).map((provider: any) => `${provider.name ?? "Doctor"}${provider.specialization ? ` — ${provider.specialization}` : ""}${provider.qualifications ? ` · ${provider.qualifications}` : ""}`)),
    "",
    "LOCATIONS",
    ...((data.locations ?? []).flatMap((location: any) => [`${location.name ?? "Clinic"}${location.address ? ` — ${typeof location.address === "object" ? Object.values(location.address).filter(Boolean).join(", ") : location.address}` : ""}${location.phone ? ` · ${location.phone}` : ""}`, ...(location.google_maps_url ? [`Google Maps: ${location.google_maps_url}`] : [])])),
    "",
    business.phone ? `Front desk: ${business.phone}` : "Contact the clinic through its official WhatsApp channel.",
    "For live availability and appointments, return to the booking page.",
  ];
  const pdf = createPdf(lines);
  return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${String(slug).replace(/[^a-z0-9-]/gi, "-")}-clinic-brochure.pdf"`, "cache-control": "public, max-age=300" } });
}
