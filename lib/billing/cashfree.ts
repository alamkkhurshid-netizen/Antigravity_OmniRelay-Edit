import crypto from "crypto";

export interface CashfreeOrderParams {
  orderId: string;
  amountInr: number;
  customerId: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  returnUrl?: string | null;
  notifyUrl?: string | null;
  notes?: Record<string, string>;
}

export interface CashfreeOrderResult {
  orderId: string;
  cfOrderId: string;
  paymentSessionId: string;
  orderStatus: string;
}

export function isCashfreeConfigured(): boolean {
  return Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
}

export function getCashfreeBaseUrl(): string {
  const mode = (process.env.CASHFREE_MODE || "production").toLowerCase();
  return mode === "sandbox"
    ? "https://sandbox.cashfree.com/pg"
    : "https://api.cashfree.com/pg";
}

/**
 * Creates an order directly with Cashfree PG
 */
export async function createCashfreeOrder(params: CashfreeOrderParams): Promise<CashfreeOrderResult> {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;

  if (!appId || !secretKey) {
    throw new Error("Cashfree credentials (CASHFREE_APP_ID / CASHFREE_SECRET_KEY) are not configured.");
  }

  // Cashfree requires phone number formatted with digits (fallback to a dummy valid 10-digit number if missing)
  const phone = (params.customerPhone || "").replace(/\D/g, "");
  const validPhone = phone.length >= 10 ? phone.slice(-10) : "9999999999";
  const validEmail = params.customerEmail && params.customerEmail.includes("@")
    ? params.customerEmail
    : "billing@omnirelay.ai";

  const payload = {
    order_id: params.orderId,
    order_amount: Number(params.amountInr.toFixed(2)),
    order_currency: "INR",
    customer_details: {
      customer_id: params.customerId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50),
      customer_name: params.customerName || "Clinic Owner",
      customer_email: validEmail,
      customer_phone: validPhone,
    },
    order_meta: {
      return_url: params.returnUrl || null,
      notify_url: params.notifyUrl || null,
    },
    order_tags: params.notes || undefined,
  };

  const response = await fetch(`${getCashfreeBaseUrl()}/orders`, {
    method: "POST",
    headers: {
      "x-client-id": appId,
      "x-client-secret": secretKey,
      "x-api-version": "2023-08-01",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.payment_session_id) {
    const errorMsg = data.message || data.error || `Cashfree order creation failed (${response.status})`;
    throw new Error(errorMsg);
  }

  return {
    orderId: data.order_id,
    cfOrderId: data.cf_order_id,
    paymentSessionId: data.payment_session_id,
    orderStatus: data.order_status,
  };
}

/**
 * Fetches order details directly from Cashfree to verify captured status
 */
export async function getCashfreeOrder(orderId: string): Promise<Record<string, unknown>> {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;

  if (!appId || !secretKey) {
    throw new Error("Cashfree credentials missing");
  }

  const response = await fetch(`${getCashfreeBaseUrl()}/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      "x-client-id": appId,
      "x-client-secret": secretKey,
      "x-api-version": "2023-08-01",
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Cashfree order lookup failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Fetches payments associated with a specific Cashfree order
 */
export async function getCashfreeOrderPayments(orderId: string): Promise<Array<Record<string, unknown>>> {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;

  if (!appId || !secretKey) {
    return [];
  }

  try {
    const response = await fetch(`${getCashfreeBaseUrl()}/orders/${encodeURIComponent(orderId)}/payments`, {
      headers: {
        "x-client-id": appId,
        "x-client-secret": secretKey,
        "x-api-version": "2023-08-01",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Cryptographically verifies Cashfree webhook signature
 * signedPayload := timestamp + rawPayload
 * expectedSignature := Base64Encode(HMACSHA256(signedPayload, secretKey))
 */
export function verifyCashfreeWebhookSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null
): boolean {
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!secret || !signature || !timestamp) return false;

  try {
    const signedPayload = `${timestamp}${rawBody}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("base64");

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export interface CashfreeSubscriptionParams {
  subscriptionId: string;
  planName: string;
  amountInr: number;
  customerId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  returnUrl?: string | null;
}

export interface CashfreeSubscriptionResult {
  subscriptionId: string;
  cfSubscriptionId?: string;
  authLink?: string;
  status: string;
}

/**
 * Registers an automated recurring subscription via Cashfree Subscriptions (UPI Autopay / Cards)
 */
export async function createCashfreeSubscription(
  params: CashfreeSubscriptionParams
): Promise<CashfreeSubscriptionResult> {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;

  if (!appId || !secretKey) {
    throw new Error("Cashfree credentials (CASHFREE_APP_ID / CASHFREE_SECRET_KEY) are not configured.");
  }

  const phone = (params.customerPhone || "").replace(/\D/g, "");
  const validPhone = phone.length >= 10 ? phone.slice(-10) : "9999999999";
  const validEmail =
    params.customerEmail && params.customerEmail.includes("@")
      ? params.customerEmail
      : "billing@omnirelay.ai";

  const payload = {
    subscription_id: params.subscriptionId,
    customer_details: {
      customer_id: params.customerId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50),
      customer_name: params.customerName || "Clinic Owner",
      customer_email: validEmail,
      customer_phone: validPhone,
    },
    plan_details: {
      plan_name: params.planName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40),
      plan_type: "PERIODIC",
      plan_amount: Number(params.amountInr.toFixed(2)),
      plan_max_amount: Number((params.amountInr * 1.5).toFixed(2)),
      plan_max_cycles: 120,
      plan_intervals: 1,
      plan_currency: "INR",
      plan_interval_type: "MONTH",
      plan_note: `${params.planName} Monthly Subscription`,
    },
    authorization_details: {
      authorization_amount: 1,
      authorization_amount_refund: true,
      payment_methods: ["upi", "card"],
    },
    subscription_meta: {
      return_url: params.returnUrl || null,
      notification_channel: ["EMAIL", "SMS"],
    },
  };

  const response = await fetch(`${getCashfreeBaseUrl()}/subscriptions`, {
    method: "POST",
    headers: {
      "x-client-id": appId,
      "x-client-secret": secretKey,
      "x-api-version": "2023-08-01",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.message || data.error || `Cashfree subscription creation failed (${response.status})`;
    const error = new Error(errorMsg);
    (error as any).code = data.code;
    throw error;
  }

  return {
    subscriptionId: data.subscription_id || params.subscriptionId,
    cfSubscriptionId: data.cf_subscription_id,
    authLink: data.auth_link,
    status: data.subscription_status || "PENDING",
  };
}


