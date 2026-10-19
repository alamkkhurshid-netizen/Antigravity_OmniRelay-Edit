import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import {
  getAllFeatureFlags,
  setFeatureFlagOverride,
  KNOWN_FEATURE_FLAGS,
  satisfiesTier,
} from "@/lib/feature-flags";
import { recordTeamAudit } from "@/lib/operations";

export async function GET(_request: Request) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !organization) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  // Load authoritative committed values from PostgreSQL
  const { data: dbOrg } = await supabase
    .from("organizations")
    .select("id, extra")
    .eq("id", organization.id)
    .maybeSingle();

  const flags = getAllFeatureFlags(organization.id, dbOrg || organization);
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

  // 1. RBAC check: Only workspace owner or admin can configure feature flags
  const { data: actor } = await supabase
    .from("agents")
    .select("id,extra")
    .eq("organization_id", organization.id)
    .eq("user_id", user.id)
    .eq("ai", false)
    .maybeSingle();

  const role = actor?.extra?.role;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: Only workspace owners and administrators can configure feature flags." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { flagKey, enabled } = body;

  if (!flagKey || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "flagKey and boolean enabled are required." }, { status: 400 });
  }

  const flagDef = KNOWN_FEATURE_FLAGS[flagKey];
  if (!flagDef) {
    return NextResponse.json({ error: `Unknown feature flag key: ${flagKey}` }, { status: 400 });
  }

  // 2. Tier requirement enforcement
  const orgExtra = (organization.extra as Record<string, unknown>) || {};
  const orgTier = String(orgExtra.plan_tier || orgExtra.tier || "starter");
  if (enabled && flagDef.requiresTier && !satisfiesTier(orgTier, flagDef.requiresTier)) {
    return NextResponse.json(
      {
        error: `Tier requirement not met: '${flagDef.name}' requires the ${flagDef.requiresTier.toUpperCase()} plan (current organization is on ${orgTier.toUpperCase()}).`,
      },
      { status: 403 }
    );
  }

  // 3. Durable persistence in PostgreSQL organizations table (Fail-Closed)
  const updatedFlags = {
    ...((orgExtra.feature_flags as Record<string, boolean>) || {}),
    [flagKey]: enabled,
  };

  const { data: committedOrg, error: dbErr } = await supabase
    .from("organizations")
    .update({
      extra: {
        ...orgExtra,
        feature_flags: updatedFlags,
      },
    })
    .eq("id", organization.id)
    .select("id, extra")
    .maybeSingle();

  if (dbErr) {
    return NextResponse.json(
      { error: `Database persistence failed: ${dbErr.message || "Could not commit feature flag to PostgreSQL"}` },
      { status: 500 }
    );
  }

  // 4. Update coherent cache with invalidation
  setFeatureFlagOverride(organization.id, flagKey, enabled);

  // 5. Durable audit trail recording (Fail-Closed in production)
  try {
    await recordTeamAudit({
      organizationId: organization.id,
      actorUserId: user.id,
      subjectAgentId: actor?.id || user.id,
      eventType: "feature_flag_updated",
      summary: `Feature flag '${flagDef.name}' set to ${enabled ? "ENABLED" : "DISABLED"}`,
      metadata: { flagKey, enabled, orgTier },
    });
  } catch (auditErr: unknown) {
    const auditMsg = auditErr instanceof Error ? auditErr.message : "Unknown audit error";
    console.error("Critical: Feature flag audit recording failed:", auditMsg);
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Compliance failure: Could not record durable audit event for feature flag update." },
        { status: 500 }
      );
    }
  }

  const committedFlags = ((committedOrg?.extra as Record<string, unknown>)?.feature_flags as Record<string, boolean>) || updatedFlags;
  const committedValue = Boolean(committedFlags[flagKey]);

  return NextResponse.json({
    success: true,
    flagKey,
    enabled: committedValue,
  });
}


