import { createAdminClient } from "../supabase/admin";

export interface ThresholdAlertResult {
  alertFired: boolean;
  type?: "warning" | "critical";
  balanceInr: number;
  reason?: string;
}

/**
 * Dispatches balance threshold crossing notifications (deduplicated per 24 hours).
 * Prevents alert storms by checking operational_events for recent alerts.
 */
export async function dispatchThresholdAlertIfNeeded(
  organizationId: string,
  balancePaise: number,
  warningTriggered: boolean,
  criticalTriggered: boolean
): Promise<ThresholdAlertResult> {
  if (!warningTriggered && !criticalTriggered) {
    return { alertFired: false, balanceInr: balancePaise / 100 };
  }

  const alertType = criticalTriggered ? "critical" : "warning";
  const balanceInr = balancePaise / 100;
  const admin = createAdminClient();

  // Deduplication check: Has an alert of this type been dispatched in the last 24h?
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentAlert } = await admin
    .from("operational_events")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("error_code", alertType === "critical" ? "LOW_WALLET_CRITICAL" : "LOW_WALLET_WARNING")
    .gte("occurred_at", twentyFourHoursAgo)
    .limit(1)
    .maybeSingle();

  if (recentAlert) {
    return {
      alertFired: false,
      type: alertType,
      balanceInr,
      reason: "Alert suppressed: Already notified within past 24 hours",
    };
  }

  // Record operational event for tracking and operator dashboard visibility
  await admin.from("operational_events").insert({
    organization_id: organizationId,
    event_source: "billing_deduction_engine",
    severity: alertType,
    error_code: alertType === "critical" ? "LOW_WALLET_CRITICAL" : "LOW_WALLET_WARNING",
    safe_message: alertType === "critical"
      ? `CRITICAL: Operational wallet balance is ₹${balanceInr.toFixed(2)}. Outbound messaging will pause soon.`
      : `WARNING: Operational wallet balance is low (₹${balanceInr.toFixed(2)}). Please top up.`,
    metadata: {
      balance_paise: balancePaise,
      balance_inr: balanceInr,
      alert_type: alertType,
      dispatched_at: new Date().toISOString(),
    },
  });

  return {
    alertFired: true,
    type: alertType,
    balanceInr,
  };
}
