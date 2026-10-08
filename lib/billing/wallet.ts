import { createAdminClient } from "../supabase/admin";

export interface WalletBalance {
  organizationId: string;
  balancePaise: number;
  balanceInr: number;
  warningThresholdPaise: number;
  criticalThresholdPaise: number;
  isWarning: boolean;
  isCritical: boolean;
  currency: string;
}

export interface CreditWalletResult {
  success: boolean;
  alreadyProcessed: boolean;
  organizationId: string;
  balancePaise: number;
  balanceInr: number;
  transactionId?: string;
  amountCreditedPaise?: number;
}

/**
 * Retrieve current operational wallet balance and threshold warnings for an organization.
 */
export async function getWalletBalance(organizationId: string): Promise<WalletBalance> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("billing")
    .from("tenant_wallets")
    .select("balance_paise, warning_threshold_paise, critical_threshold_paise, currency")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[Wallet] Error fetching wallet balance:", error);
    throw new Error(`Failed to fetch wallet balance for organization ${organizationId}: ${error.message}`);
  }

  const balancePaise = data?.balance_paise ?? 0;
  const warningThresholdPaise = data?.warning_threshold_paise ?? 50000;
  const criticalThresholdPaise = data?.critical_threshold_paise ?? 20000;

  return {
    organizationId,
    balancePaise,
    balanceInr: balancePaise / 100,
    warningThresholdPaise,
    criticalThresholdPaise,
    isWarning: balancePaise < warningThresholdPaise,
    isCritical: balancePaise < criticalThresholdPaise,
    currency: data?.currency ?? "INR",
  };
}

/**
 * Idempotently credit a tenant's wallet after successful payment capture.
 * Protected against duplicate webhook calls via unique payment ID check in PostgreSQL.
 */
export async function creditWallet(
  organizationId: string,
  amountPaise: number,
  razorpayPaymentId: string,
  orderId?: string,
  gstPaise: number = 0,
  metadata: Record<string, any> = {}
): Promise<CreditWalletResult> {
  if (!organizationId) throw new Error("organizationId is required");
  if (!razorpayPaymentId) throw new Error("razorpayPaymentId is required for idempotency");
  if (amountPaise <= 0) throw new Error("amountPaise must be greater than 0");

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("credit_wallet", {
    p_organization_id: organizationId,
    p_amount_paise: amountPaise,
    p_razorpay_payment_id: razorpayPaymentId,
    p_razorpay_order_id: orderId || null,
    p_gst_paise: gstPaise,
    p_metadata: metadata,
  });

  if (error) {
    console.error("[Wallet] Error calling credit_wallet RPC:", error);
    throw new Error(`Failed to credit wallet: ${error.message}`);
  }

  const result = typeof data === "string" ? JSON.parse(data) : data;

  return {
    success: !!result?.success,
    alreadyProcessed: !!result?.already_processed,
    organizationId,
    balancePaise: result?.balance_paise ?? 0,
    balanceInr: (result?.balance_paise ?? 0) / 100,
    transactionId: result?.transaction_id,
    amountCreditedPaise: result?.amount_credited_paise,
  };
}

/**
 * Fetch wallet transaction ledger history for audit and customer dashboard.
 */
export async function getWalletTransactions(organizationId: string, limit: number = 20) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .schema("billing")
    .from("wallet_transactions")
    .select("id, amount_paise, transaction_type, razorpay_payment_id, gst_amount_paise, invoice_number, status, created_at, metadata")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[Wallet] Error fetching transactions:", error);
    throw new Error(`Failed to fetch wallet transactions: ${error.message}`);
  }

  return (data || []).map((tx) => ({
    ...tx,
    amountInr: tx.amount_paise / 100,
    gstAmountInr: (tx.gst_amount_paise || 0) / 100,
  }));
}
