export type SubscriptionPlanId = "plan_launchpad" | "plan_growth" | "plan_pro";

export interface PlanDefinition {
  id: SubscriptionPlanId;
  name: string;
  monthlyPriceInr: number;
  monthlyPricePaise: number;
  features: string[];
  maxProviders: number;
  maxLocations: number;
}

export const SAAS_PLANS: Record<SubscriptionPlanId, PlanDefinition> = {
  plan_launchpad: {
    id: "plan_launchpad",
    name: "OmniRelay Launchpad",
    monthlyPriceInr: 499,
    monthlyPricePaise: 49900,
    features: [
      "basic_booking",
      "whatsapp_concierge",
      "standard_templates",
      "patient_inbox",
    ],
    maxProviders: 1,
    maxLocations: 1,
  },
  plan_growth: {
    id: "plan_growth",
    name: "Clinic Growth",
    monthlyPriceInr: 2400,
    monthlyPricePaise: 240000,
    features: [
      "basic_booking",
      "whatsapp_concierge",
      "standard_templates",
      "patient_inbox",
      "doctor_roster",
      "reminders_24h_2h",
      "google_calendar_sync",
      "patient_portal",
      "rag_knowledge",
    ],
    maxProviders: 5,
    maxLocations: 2,
  },
  plan_pro: {
    id: "plan_pro",
    name: "Clinic Operations Pro",
    monthlyPriceInr: 6500,
    monthlyPricePaise: 650000,
    features: [
      "basic_booking",
      "whatsapp_concierge",
      "standard_templates",
      "patient_inbox",
      "doctor_roster",
      "reminders_24h_2h",
      "google_calendar_sync",
      "patient_portal",
      "rag_knowledge",
      "voice_ai_agent",
      "campaigns_broadcast",
      "multi_doctor_queue",
      "custom_branding",
      "priority_support",
    ],
    maxProviders: 20,
    maxLocations: 10,
  },
};

export interface EntitlementCheckResult {
  allowed: boolean;
  status: "active" | "trialing" | "past_due" | "suspended" | "cancelled";
  planId: string;
  reason?: string;
}

/**
 * Enforces feature gating based on the tenant's current subscription plan and entitlement status.
 * Suspended workspaces are strictly restricted to read-only views.
 */
export async function checkFeatureEntitlement(
  organizationId: string,
  requiredFeature: string
): Promise<EntitlementCheckResult> {
  const { createAdminClient } = await import("../supabase/admin");
  const admin = createAdminClient();

  const { data: ent, error } = await admin
    .from("entitlements")
    .select("plan_id, status, trial_ends_at, current_period_end")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !ent) {
    return {
      allowed: false,
      status: "suspended",
      planId: "none",
      reason: "No active entitlement record found for this organization.",
    };
  }

  const status = (ent.status as EntitlementCheckResult["status"]) || "trialing";

  // Hard stop on suspended tenants
  if (status === "suspended") {
    return {
      allowed: false,
      status: "suspended",
      planId: ent.plan_id || "none",
      reason: "Workspace is suspended due to administrative hold or unpaid subscription.",
    };
  }

  // Active trial check
  if (status === "trialing") {
    if (ent.trial_ends_at && new Date(ent.trial_ends_at).getTime() < Date.now()) {
      return {
        allowed: false,
        status: "suspended",
        planId: ent.plan_id || "trial",
        reason: "Trial period expired. Please select a subscription plan to continue.",
      };
    }
    // During valid trial, allow all core features
    return {
      allowed: true,
      status: "trialing",
      planId: ent.plan_id || "trial",
    };
  }

  // Map database plan_id to normalized plan definition
  const rawPlanId = ent.plan_id || "plan_growth";
  const planKey = (
    rawPlanId.startsWith("plan_") ? rawPlanId : `plan_${rawPlanId}`
  ) as SubscriptionPlanId;

  const planDef = SAAS_PLANS[planKey] || SAAS_PLANS.plan_growth;

  const hasFeature = planDef.features.includes(requiredFeature);
  if (!hasFeature) {
    return {
      allowed: false,
      status,
      planId: planDef.id,
      reason: `Feature '${requiredFeature}' requires an upgrade from ${planDef.name}.`,
    };
  }

  return {
    allowed: true,
    status,
    planId: planDef.id,
  };
}

export type DunningTransition = "payment_failed" | "payment_succeeded" | "cancelled" | "upgraded";

/**
 * Manages the subscription lifecycle state machine and dunning flow.
 * Dunning policy:
 * - Failure 1 & 2: Set status to 'past_due', grant 7-day grace period, send notification.
 * - Failure 3: Set status to 'suspended', pause active messaging workers.
 */
export async function handleSubscriptionTransition(
  organizationId: string,
  event: DunningTransition,
  metadata: { newPlanId?: SubscriptionPlanId; failureReason?: string } = {}
) {
  const { createAdminClient } = await import("../supabase/admin");
  const admin = createAdminClient();

  const { data: ent } = await admin
    .from("entitlements")
    .select("status, plan_id, extra")
    .eq("organization_id", organizationId)
    .single();

  const extra = (ent?.extra || {}) as Record<string, unknown>;
  const dunningInfo = (extra.dunning || { retryCount: 0, gracePeriodEndsAt: null }) as {
    retryCount: number;
    gracePeriodEndsAt: string | null;
  };

  const now = new Date();

  if (event === "payment_succeeded") {
    // Reset dunning state, renew period for 30 days
    const nextPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await admin
      .from("entitlements")
      .update({
        status: "active",
        current_period_end: nextPeriodEnd,
        extra: {
          ...extra,
          dunning: { retryCount: 0, gracePeriodEndsAt: null, lastSuccessAt: now.toISOString() },
        },
      })
      .eq("organization_id", organizationId);

    return { success: true, status: "active", nextPeriodEnd };
  }

  if (event === "upgraded" && metadata.newPlanId) {
    await admin
      .from("entitlements")
      .update({
        plan_id: metadata.newPlanId,
        status: "active",
      })
      .eq("organization_id", organizationId);

    return { success: true, status: "active", planId: metadata.newPlanId };
  }

  if (event === "payment_failed") {
    const newRetryCount = (dunningInfo.retryCount || 0) + 1;
    const isSuspension = newRetryCount >= 3;

    let gracePeriodEnd = dunningInfo.gracePeriodEndsAt;
    if (!gracePeriodEnd) {
      // 7 days grace period from first failure
      gracePeriodEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }

    const newStatus = isSuspension ? "suspended" : "past_due";

    await admin
      .from("entitlements")
      .update({
        status: newStatus,
        extra: {
          ...extra,
          dunning: {
            retryCount: newRetryCount,
            gracePeriodEndsAt: gracePeriodEnd,
            lastFailedAt: now.toISOString(),
            failureReason: metadata.failureReason || "Payment capture declined",
          },
        },
      })
      .eq("organization_id", organizationId);

    // Record operational event for monitoring
    await admin.from("operational_events").insert({
      organization_id: organizationId,
      event_source: "subscription_dunning_engine",
      severity: isSuspension ? "critical" : "warning",
      error_code: isSuspension ? "SUBSCRIPTION_SUSPENDED" : "SUBSCRIPTION_PAST_DUE",
      safe_message: isSuspension
        ? `Workspace suspended after 3 failed subscription payment retries.`
        : `Payment failed (attempt ${newRetryCount}/3). Grace period active until ${gracePeriodEnd}.`,
      metadata: {
        retry_count: newRetryCount,
        grace_period_ends_at: gracePeriodEnd,
        reason: metadata.failureReason,
      },
    });

    return {
      success: true,
      status: newStatus,
      retryCount: newRetryCount,
      gracePeriodEndsAt: gracePeriodEnd,
    };
  }

  if (event === "cancelled") {
    await admin
      .from("entitlements")
      .update({
        status: "cancelled",
        extra: {
          ...extra,
          cancelled_at: now.toISOString(),
        },
      })
      .eq("organization_id", organizationId);

    return { success: true, status: "cancelled" };
  }

  return { success: false, error: `Unhandled event: ${event}` };
}
