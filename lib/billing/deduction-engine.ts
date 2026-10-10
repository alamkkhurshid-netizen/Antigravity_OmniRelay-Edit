import { createAdminClient } from "../supabase/admin";

export type MessageCategory = "utility" | "marketing" | "authentication" | "service" | "voice";
export type MessageChannel = "whatsapp" | "voice" | "sms";

export interface CanSendResult {
  allowed: boolean;
  organizationId: string;
  category: MessageCategory;
  currentBalancePaise: number;
  currentBalanceInr: number;
  estimatedCostPaise: number;
  estimatedCostInr: number;
  bufferUsed: boolean;
  reason: string;
}

export interface DeductionResult {
  success: boolean;
  alreadyDeducted: boolean;
  organizationId: string;
  metaMessageId: string;
  ledgerId?: string;
  deductedPaise: number;
  deductedInr: number;
  newBalancePaise: number;
  newBalanceInr: number;
  warningTriggered: boolean;
  criticalTriggered: boolean;
}

export interface GstBreakdown {
  baseAmountInr: number;
  gstAmountInr: number;
  totalPayableInr: number;
  baseAmountPaise: number;
  gstAmountPaise: number;
  totalPayablePaise: number;
}

/**
 * Calculates official 18% GST for top-up invoices in India.
 */
export function calculateTopUpWithGst(amountInr: number): GstBreakdown {
  const baseAmountInr = Math.max(0, amountInr);
  const gstAmountInr = Math.round(baseAmountInr * 0.18 * 100) / 100;
  const totalPayableInr = Math.round((baseAmountInr + gstAmountInr) * 100) / 100;

  return {
    baseAmountInr,
    gstAmountInr,
    totalPayableInr,
    baseAmountPaise: Math.round(baseAmountInr * 100),
    gstAmountPaise: Math.round(gstAmountInr * 100),
    totalPayablePaise: Math.round(totalPayableInr * 100),
  };
}

/**
 * Fetches the active base rate from the meta_rate_card configuration table.
 */
export async function getMessageRate(
  category: MessageCategory,
  channel: MessageChannel = "whatsapp",
  countryCode: string = "IN"
): Promise<{ baseRatePaise: number; baseRateInr: number; currency: string }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("billing")
    .from("meta_rate_card")
    .select("base_rate_paise, currency")
    .eq("channel", channel)
    .eq("country_code", countryCode)
    .eq("category", category)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    // Official Oct 1, 2026 fallback rates
    const fallbacks: Record<MessageCategory, number> = {
      utility: 12,
      authentication: 12,
      marketing: 78,
      service: 29,
      voice: 250,
    };
    const baseRatePaise = fallbacks[category] ?? 12;
    return {
      baseRatePaise,
      baseRateInr: baseRatePaise / 100,
      currency: "INR",
    };
  }

  return {
    baseRatePaise: data.base_rate_paise,
    baseRateInr: data.base_rate_paise / 100,
    currency: data.currency,
  };
}

/**
 * Block-Before-Send check.
 * Must be called immediately BEFORE Meta Graph API dispatch or Voice Call connect.
 * Enforces policy:
 * - Marketing: Hard block at ₹0.
 * - Utility/Auth: Allows -₹50 buffer so patient care reminders are never dropped.
 */
export async function canSendMessage(
  organizationId: string,
  category: MessageCategory,
  channel: MessageChannel = "whatsapp",
  countryCode: string = "IN"
): Promise<CanSendResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("can_send_message", {
    p_organization_id: organizationId,
    p_category: category,
    p_channel: channel,
    p_country_code: countryCode,
  });

  if (error) {
    console.error("[DeductionEngine] can_send_message RPC failed:", error);
    throw new Error(`can_send_message check failed: ${error.message}`);
  }

  const res = typeof data === "string" ? JSON.parse(data) : data;

  return {
    allowed: !!res?.allowed,
    organizationId,
    category,
    currentBalancePaise: res?.current_balance_paise ?? 0,
    currentBalanceInr: (res?.current_balance_paise ?? 0) / 100,
    estimatedCostPaise: res?.estimated_cost_paise ?? 0,
    estimatedCostInr: (res?.estimated_cost_paise ?? 0) / 100,
    bufferUsed: !!res?.buffer_used,
    reason: res?.reason ?? "UNKNOWN",
  };
}

/**
 * Atomic row-level locked deduction and message ledger insertion.
 * Triggered on Meta Delivery Webhook or Voice Call log persistence.
 * Safe against concurrent reminder batch dispatches.
 */
export async function recordAndDeduct(
  organizationId: string,
  metaMessageId: string,
  category: MessageCategory,
  channel: MessageChannel = "whatsapp",
  countryCode: string = "IN",
  quantity: number = 1
): Promise<DeductionResult> {
  if (!organizationId) throw new Error("organizationId required");
  if (!metaMessageId) throw new Error("metaMessageId required for idempotency");

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("record_and_deduct", {
    p_organization_id: organizationId,
    p_meta_message_id: metaMessageId,
    p_category: category,
    p_channel: channel,
    p_country_code: countryCode,
    p_quantity: Math.max(1, Math.round(quantity)),
  });

  if (error) {
    console.error("[DeductionEngine] record_and_deduct RPC failed:", error);
    throw new Error(`Atomic deduction failed: ${error.message}`);
  }

  const res = typeof data === "string" ? JSON.parse(data) : data;

  return {
    success: !!res?.success,
    alreadyDeducted: !!res?.already_deducted,
    organizationId,
    metaMessageId,
    ledgerId: res?.ledger_id,
    deductedPaise: res?.deducted_paise ?? 0,
    deductedInr: (res?.deducted_paise ?? 0) / 100,
    newBalancePaise: res?.new_balance_paise ?? 0,
    newBalanceInr: (res?.new_balance_paise ?? 0) / 100,
    warningTriggered: !!res?.warning_triggered,
    criticalTriggered: !!res?.critical_triggered,
  };
}
