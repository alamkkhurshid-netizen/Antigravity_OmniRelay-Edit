import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

const severities = new Set(["low", "medium", "high", "critical"]);
const categories = new Set(["unauthorized_access", "data_exposure", "credential_compromise", "service_outage", "provider_failure", "suspicious_activity", "other"]);
const statuses = new Set(["open", "contained", "monitoring", "resolved", "closed"]);
function safeText(value: unknown, min: number, max: number) { const result = typeof value === "string" ? value.trim() : ""; return result.length >= min && result.length <= max ? result : null; }

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = safeText(payload.title, 5, 160); const safeSummary = safeText(payload.safeSummary, 5, 1000);
  if (!title || !safeSummary || !severities.has(String(payload.severity)) || !categories.has(String(payload.category))) return NextResponse.json({ error: "Complete the safe incident title, category, severity and summary." }, { status: 400 });
  const { data: allowed } = await supabase.rpc("consume_api_rate_limit", { p_bucket: "incident_create", p_limit: 10, p_window_seconds: 3600 });
  if (!allowed) return NextResponse.json({ error: "Incident creation limit reached. Try again later." }, { status: 429 });
  const { data, error } = await supabase.from("security_incidents").insert({ organization_id: organization.id, severity: payload.severity, category: payload.category, title, safe_summary: safeSummary, owner_user_id: user.id, created_by: user.id, updated_by: user.id }).select("id,reference,severity,category,status,title,safe_summary,containment_summary,resolution_summary,created_at,updated_at").single();
  if (error) return NextResponse.json({ error: error.code === "42501" ? "Administrator access required." : "Incident could not be created." }, { status: error.code === "42501" ? 403 : 409 });
  return NextResponse.json({ incident: data });
}

export async function PATCH(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>; const id = typeof payload.id === "string" ? payload.id : ""; const status = String(payload.status ?? "");
  const containment = payload.containmentSummary ? safeText(payload.containmentSummary, 5, 1000) : null; const resolution = payload.resolutionSummary ? safeText(payload.resolutionSummary, 5, 1000) : null;
  if (!id || !statuses.has(status) || (payload.containmentSummary && !containment) || (payload.resolutionSummary && !resolution)) return NextResponse.json({ error: "A valid incident status and safe summary are required." }, { status: 400 });
  if (["resolved", "closed"].includes(status) && !resolution) return NextResponse.json({ error: "Resolution summary is required before resolving or closing." }, { status: 400 });
  const { data: allowed } = await supabase.rpc("consume_api_rate_limit", { p_bucket: "incident_update", p_limit: 30, p_window_seconds: 3600 });
  if (!allowed) return NextResponse.json({ error: "Incident update limit reached. Try again later." }, { status: 429 });
  const changes: Record<string, unknown> = { status, updated_by: user.id }; if (containment) changes.containment_summary = containment; if (resolution) changes.resolution_summary = resolution;
  const { data, error } = await supabase.from("security_incidents").update(changes).eq("id", id).eq("organization_id", organization.id).select("id,reference,severity,category,status,title,safe_summary,containment_summary,resolution_summary,created_at,updated_at").single();
  if (error) return NextResponse.json({ error: error.code === "42501" ? "Administrator access required." : "Incident could not be updated." }, { status: error.code === "42501" ? 403 : 409 });
  return NextResponse.json({ incident: data });
}
