import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseUrl } from "@/lib/supabase/config";

type Entry = {
  source_identifier: string;
  entry_type: "brand" | "generic";
  display_name: string;
  generic_identifier: string | null;
  generic_name: string | null;
  product_identifier: string | null;
  product_name: string | null;
  supplier_identifier: string | null;
  supplier_name: string | null;
  dose_form_identifier: string | null;
  dose_form_name: string | null;
  route_identifiers: string[];
  route_names: string[];
  search_text: string;
  status: "active" | "quarantined";
  quality_flags: string[];
};

type Payload =
  | { action: "stage"; release: Record<string, unknown> }
  | { action: "batch"; releaseId: string; entries: Entry[] }
  | { action: "activate"; releaseId: string };

const authorized = (request: Request) => {
  const expected = process.env.MEDICINE_IMPORT_SECRET;
  const supplied = request.headers.get("x-omni-import-secret");
  return Boolean(expected && supplied && expected.length >= 32 && supplied === expected);
};

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "Import service is not configured." }, { status: 503 });
  }
  const payload = (await request.json().catch(() => null)) as Payload | null;
  if (!payload) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (payload.action === "stage") {
    const { data: existing } = await supabase
      .from("medicine_catalog_releases")
      .select("id,status")
      .eq("package_sha256", String(payload.release.package_sha256 ?? ""))
      .maybeSingle();
    const { data, error } = existing
      ? { data: existing, error: null }
      : await supabase
          .from("medicine_catalog_releases")
          .insert(payload.release)
          .select("id,status")
          .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Release could not be staged." }, { status: 400 });
    }
    const { count, error: countError } = await supabase
      .from("medicine_catalog_entries")
      .select("id", { count: "exact", head: true })
      .eq("release_id", data.id);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 400 });
    return NextResponse.json({ releaseId: data.id, importedCount: count ?? 0, status: data.status });
  }

  if (payload.action === "batch") {
    if (!Array.isArray(payload.entries) || payload.entries.length === 0 || payload.entries.length > 500) {
      return NextResponse.json({ error: "A batch must contain 1–500 entries." }, { status: 400 });
    }
    const invalid = payload.entries.some(
      (entry) =>
        !entry.source_identifier ||
        !entry.display_name ||
        !entry.search_text ||
        !["brand", "generic"].includes(entry.entry_type) ||
        !["active", "quarantined"].includes(entry.status),
    );
    if (invalid) return NextResponse.json({ error: "Invalid catalogue entry." }, { status: 400 });
    const { error } = await supabase.from("medicine_catalog_entries").upsert(
      payload.entries.map((entry) => ({ ...entry, release_id: payload.releaseId })),
      { onConflict: "release_id,entry_type,source_identifier" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ inserted: payload.entries.length });
  }

  if (payload.action === "activate") {
    const { error } = await supabase.rpc("activate_medicine_catalog_release", {
      p_release_id: payload.releaseId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ activated: true });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
