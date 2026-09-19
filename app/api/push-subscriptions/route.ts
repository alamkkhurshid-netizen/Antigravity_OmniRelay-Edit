import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

type SubscriptionPayload = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const body = await request.json().catch(() => ({})) as SubscriptionPayload;
  const endpoint = clean(body.endpoint, 2000);
  const p256dhKey = clean(body.keys?.p256dh, 512);
  const authKey = clean(body.keys?.auth, 256);
  if (!endpoint.startsWith("https://") || p256dhKey.length < 16 || authKey.length < 8) {
    return NextResponse.json({ error: "A valid device subscription is required." }, { status: 400 });
  }

  const { error } = await supabase.from("device_push_subscriptions").upsert({
    organization_id: organization.id,
    user_id: user.id,
    endpoint,
    p256dh_key: p256dhKey,
    auth_key: authKey,
    status: "active",
    revoked_at: null,
    user_agent: clean(request.headers.get("user-agent"), 500) || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,endpoint" });
  if (error) return NextResponse.json({ error: "Device alerts could not be enabled." }, { status: 409 });
  return NextResponse.json({ subscribed: true });
}

export async function PATCH(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const body = await request.json().catch(() => ({})) as { id?: unknown };
  const id = clean(body.id, 64);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Device subscription is required." }, { status: 400 });
  const { error } = await supabase.from("device_push_subscriptions")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id).eq("organization_id", organization.id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Device alerts could not be disabled." }, { status: 409 });
  return NextResponse.json({ revoked: true });
}
