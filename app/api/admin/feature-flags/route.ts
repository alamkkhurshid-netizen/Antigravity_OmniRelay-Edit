import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { getAllFeatureFlags, setFeatureFlagOverride, isFeatureEnabled } from "@/lib/feature-flags";

export async function GET(_request: Request) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !organization) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const flags = getAllFeatureFlags(organization.id);
  return NextResponse.json({
    organizationId: organization.id,
    flags,
  });
}

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !organization) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { flagKey, enabled } = body;

  if (!flagKey || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "flagKey and boolean enabled are required." }, { status: 400 });
  }

  setFeatureFlagOverride(organization.id, flagKey, enabled);

  return NextResponse.json({
    success: true,
    flagKey,
    enabled: isFeatureEnabled(flagKey, organization.id),
  });
}
