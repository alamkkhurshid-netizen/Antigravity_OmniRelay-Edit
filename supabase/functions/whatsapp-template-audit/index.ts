import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const defaultAccessToken = Deno.env.get("META_SYSTEM_USER_ACCESS_TOKEN") ?? "";
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

type MetaTemplate = {
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  components?: Array<{ type?: string; text?: string }>;
};

const safeTemplate = (template: MetaTemplate) => ({
  name: template.name ?? "",
  language: template.language ?? "",
  status: template.status ?? "",
  category: template.category ?? "",
  body_variable_count: (template.components ?? []).find((component) => component.type === "BODY")?.text?.match(/{{\d+}}/g)?.length ?? 0,
});

Deno.serve(async (request) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== serviceKey) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { organization_id: organizationId } = await request.json().catch(() => ({}));
  if (typeof organizationId !== "string" || !organizationId) {
    return Response.json({ error: "organization_id is required." }, { status: 400 });
  }

  const { data: address } = await db.from("organizations_addresses")
    .select("extra")
    .eq("organization_id", organizationId)
    .eq("service", "whatsapp")
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const extra = (address?.extra ?? {}) as Record<string, unknown>;
  const wabaId = typeof extra.waba_id === "string" ? extra.waba_id : "";
  const accessToken = typeof extra.access_token === "string" ? extra.access_token : defaultAccessToken;
  if (!wabaId || !accessToken) {
    return Response.json({ error: "Connected WhatsApp template access is unavailable." }, { status: 409 });
  }

  const graphVersion = typeof extra.graph_api_version === "string" ? extra.graph_api_version : "v24.0";
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates?fields=name,language,status,category,components&limit=250`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    return Response.json({ error: "Meta template audit failed.", status: response.status }, { status: 502 });
  }
  const payload = await response.json() as { data?: MetaTemplate[] };
  return Response.json({ templates: (payload.data ?? []).map(safeTemplate) });
});
