export type RetailOrderStatus =
  | "new"
  | "confirmed"
  | "packing"
  | "preparing"
  | "shipping"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled";

export type RetailPaymentStatus = "pending" | "paid" | "cod";

export interface OrderTimelineEvent {
  status: RetailOrderStatus;
  timestamp: string;
  note?: string;
  author?: string;
}

export interface RetailOrderItem {
  id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  catalog_id?: string | null;
  sku?: string;
}

export interface RetailOrder {
  id: string;
  organization_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address?: string | null;
  status: RetailOrderStatus;
  payment_status: RetailPaymentStatus;
  total_amount: number;
  discount_code?: string | null;
  discount_amount: number;
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  notes?: string | null;
  timeline: OrderTimelineEvent[];
  created_at: string;
  updated_at: string;
  items?: RetailOrderItem[];
}

export const VALID_ORDER_TRANSITIONS: Record<RetailOrderStatus, RetailOrderStatus[]> = {
  new: ["confirmed", "packing", "preparing", "cancelled"],
  confirmed: ["packing", "preparing", "shipping", "shipped", "cancelled"],
  packing: ["shipping", "shipped", "cancelled"],
  preparing: ["shipping", "shipped", "cancelled"],
  shipping: ["shipped", "delivered", "completed", "cancelled"],
  shipped: ["delivered", "completed", "cancelled"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

/**
 * Validates order status transitions
 */
export function isValidStatusTransition(
  currentStatus: RetailOrderStatus,
  nextStatus: RetailOrderStatus
): boolean {
  if (currentStatus === nextStatus) return true;
  const allowed = VALID_ORDER_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(nextStatus) : false;
}

/**
 * Create a timeline event when order state changes
 */
export function appendOrderTimeline(
  currentTimeline: OrderTimelineEvent[] = [],
  newStatus: RetailOrderStatus,
  note?: string,
  author: string = "system"
): OrderTimelineEvent[] {
  const event: OrderTimelineEvent = {
    status: newStatus,
    timestamp: new Date().toISOString(),
    note: note || `Order updated to ${newStatus}`,
    author,
  };
  return [...currentTimeline, event];
}

/**
 * Generates WhatsApp notification message text and variables for order lifecycle
 */
export function buildWhatsAppOrderMessage(
  order: {
    id: string;
    customer_name: string;
    total_amount: number;
    carrier?: string | null;
    tracking_number?: string | null;
    tracking_url?: string | null;
  },
  stage: "confirmed" | "shipped" | "delivered"
): { title: string; body: string; actionUrl?: string } {
  const shortId = order.id.slice(0, 8).toUpperCase();

  switch (stage) {
    case "confirmed":
      return {
        title: "Order Confirmed 🎉",
        body: `Hi ${order.customer_name}, your order #${shortId} (₹${Number(order.total_amount).toLocaleString("en-IN")}) has been confirmed and is now being prepared. We'll update you once it ships!`,
      };
    case "shipped":
      return {
        title: "Order Shipped 🚚",
        body: `Great news, ${order.customer_name}! Order #${shortId} has been dispatched${order.carrier ? ` via ${order.carrier}` : ""}.${order.tracking_number ? ` Tracking ID: ${order.tracking_number}` : ""}`,
        actionUrl: order.tracking_url || undefined,
      };
    case "delivered":
      return {
        title: "Order Delivered 📦",
        body: `Hi ${order.customer_name}, your order #${shortId} has been delivered. Thank you for shopping with us! Let us know if you need any assistance.`,
      };
  }
}

/**
 * Parse an incoming customer WhatsApp inquiry for order status
 * Matches queries like "order #1234", "track 1234", "status 1234", or just "1234"
 */
export function extractOrderLookupQuery(text: string): string | null {
  const clean = text.trim();

  // 1. Explicit hashtag: #XYZ (e.g. #a1b2c3d4, #DEL-9876)
  const hashMatch = clean.match(/#([a-zA-Z0-9-]{4,36})/);
  if (hashMatch) return hashMatch[1].toLowerCase();

  // 2. Keyword prefix with optional filler words:
  // e.g. "status of order a1b2c3d4", "track order DEL-1234", "order a1b2c3d4"
  const prefixMatch = clean.match(
    /(?:track|status|where is|order)(?:\s+(?:of|order|id|number|for|my|the|is|details))*\s*:?\s*([a-zA-Z0-9-]{4,36})/i
  );
  if (prefixMatch && !/^(?:order|track|status|where|details)$/i.test(prefixMatch[1])) {
    return prefixMatch[1].toLowerCase();
  }

  // 3. Raw standalone ID
  if (/^[a-zA-Z0-9-]{4,36}$/.test(clean)) {
    return clean.toLowerCase();
  }

  return null;
}
