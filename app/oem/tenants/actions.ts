"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

async function verifyOperator(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: isOperator } = await supabase.rpc("is_oem_operator");
  if (!isOperator) {
    throw new Error("UNAUTHORIZED: OEM operator privilege required.");
  }
}

async function recordOemAudit(
  admin: ReturnType<typeof createAdminClient>,
  actorUserId: string,
  eventType: string,
  metadata: Record<string, unknown>
) {
  try {
    await admin.from("oem_audit_events").insert({
      actor_user_id: actorUserId,
      event_type: eventType,
      metadata,
    });
  } catch {
    // Fail-open for audit logging if table doesn't allow direct insert from admin client
  }
}

export async function suspendTenant(organizationId: string, reason = "Operator administrative hold") {
  const supabase = await createClient();
  await verifyOperator(supabase);
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { error: entError } = await admin
    .from("entitlements")
    .update({ status: "suspended" })
    .eq("organization_id", organizationId);

  if (entError) return { error: entError.message };

  const { data: org } = await admin.from("organizations").select("extra").eq("id", organizationId).single();
  const extra = (org?.extra || {}) as Record<string, unknown>;
  await admin
    .from("organizations")
    .update({
      extra: {
        ...extra,
        suspension: {
          suspended_at: new Date().toISOString(),
          suspended_by: user?.id,
          reason,
        },
      },
    })
    .eq("id", organizationId);

  if (user?.id) {
    await recordOemAudit(admin, user.id, "tenant_suspended", { organizationId, reason });
  }

  revalidatePath("/oem");
  revalidatePath("/oem/tenants");
  return { success: true };
}

export async function reactivateTenant(organizationId: string) {
  const supabase = await createClient();
  await verifyOperator(supabase);
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { error: entError } = await admin
    .from("entitlements")
    .update({ status: "active" })
    .eq("organization_id", organizationId);

  if (entError) return { error: entError.message };

  const { data: org } = await admin.from("organizations").select("extra").eq("id", organizationId).single();
  const extra = (org?.extra || {}) as Record<string, unknown>;
  delete extra.suspension;
  await admin.from("organizations").update({ extra }).eq("id", organizationId);

  if (user?.id) {
    await recordOemAudit(admin, user.id, "tenant_reactivated", { organizationId });
  }

  revalidatePath("/oem");
  revalidatePath("/oem/tenants");
  return { success: true };
}

export async function extendTenantTrial(organizationId: string, additionalDays = 14) {
  const supabase = await createClient();
  await verifyOperator(supabase);
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const newTrialEnd = new Date(Date.now() + additionalDays * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await admin
    .from("entitlements")
    .update({
      trial_ends_at: newTrialEnd,
      status: "trialing",
    })
    .eq("organization_id", organizationId);

  if (error) return { error: error.message };

  if (user?.id) {
    await recordOemAudit(admin, user.id, "tenant_trial_extended", { organizationId, additionalDays, newTrialEnd });
  }

  revalidatePath("/oem/tenants");
  return { success: true, newTrialEnd };
}

export async function resetTenantOnboarding(organizationId: string) {
  const supabase = await createClient();
  await verifyOperator(supabase);
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { error } = await admin
    .from("onboarding_profiles")
    .update({ is_locked: false })
    .eq("organization_id", organizationId);

  if (error) return { error: error.message };

  if (user?.id) {
    await recordOemAudit(admin, user.id, "tenant_onboarding_reset", { organizationId });
  }

  revalidatePath("/oem/tenants");
  return { success: true };
}

export async function toggleSupportImpersonation(organizationId: string, active: boolean) {
  const supabase = await createClient();
  await verifyOperator(supabase);
  const { data: { user } } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  if (active) {
    cookieStore.set("omnirelay_impersonate_org", organizationId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 3600, // 1 hour session
    });
  } else {
    cookieStore.delete("omnirelay_impersonate_org");
  }

  if (user?.id) {
    const admin = createAdminClient();
    await recordOemAudit(admin, user.id, active ? "impersonation_started" : "impersonation_ended", {
      organizationId,
    });
  }

  revalidatePath("/app");
  return { success: true, active };
}

export async function toggleGoogleCalendarSync(organizationId: string, enabled: boolean) {
  const supabase = await createClient();
  await verifyOperator(supabase);

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("extra").eq("id", organizationId).single();
  if (!org) return { error: "Organization not found" };

  const extra = (org.extra || {}) as Record<string, unknown>;
  const features = (extra.features || {}) as Record<string, unknown>;
  features.google_calendar_sync = enabled;

  const { error } = await admin
    .from("organizations")
    .update({ extra: { ...extra, features } })
    .eq("id", organizationId);

  if (error) return { error: error.message };

  revalidatePath("/oem/tenants");
  return { success: true };
}

export async function togglePremiumAgent(
  organizationId: string,
  agentType: "support" | "growth" | "cto" | "admin",
  enabled: boolean
) {
  const supabase = await createClient();
  await verifyOperator(supabase);

  const columnMap = {
    support: "premium_support_agent_active",
    growth: "premium_growth_agent_active",
    cto: "premium_cto_agent_active",
    admin: "premium_admin_agent_active",
  };

  const admin = createAdminClient();
  const updatePayload = { [columnMap[agentType]]: enabled };

  const { error } = await admin.from("organizations").update(updatePayload).eq("id", organizationId);

  if (error) return { error: error.message };

  revalidatePath("/oem/tenants");
  return { success: true };
}
