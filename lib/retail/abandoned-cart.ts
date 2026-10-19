export interface AbandonedCartItem {
  sku: string;
  title: string;
  quantity: number;
  price: number;
  image_link?: string;
}

export interface AbandonedCart {
  id: string;
  organization_id: string;
  customer_phone: string;
  customer_name?: string | null;
  cart_items: AbandonedCartItem[];
  cart_value: number;
  recovered: boolean;
  recovery_sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Determines if a cart is eligible for an abandoned cart recovery nudge
 */
export function isEligibleForRecoveryNudge(
  cart: AbandonedCart,
  delayMinutes: number = 60
): boolean {
  if (cart.recovered) return false;
  if (cart.recovery_sent_at) return false; // Already nudged once
  if (!cart.cart_items || cart.cart_items.length === 0) return false;

  const createdAt = new Date(cart.created_at).getTime();
  const now = Date.now();
  const elapsedMinutes = (now - createdAt) / (1000 * 60);

  return elapsedMinutes >= delayMinutes;
}

/**
 * Builds WhatsApp recovery message for an abandoned cart
 */
export function buildAbandonedCartRecoveryMessage(
  cart: AbandonedCart,
  storeUrl?: string,
  couponCode: string = "RECOVER10"
): { body: string; callToAction: string } {
  const name = cart.customer_name ? `Hi ${cart.customer_name}` : "Hi there";
  const itemCount = cart.cart_items.reduce((sum, item) => sum + item.quantity, 0);
  const topItem = cart.cart_items[0]?.title || "items";

  const body = `${name}! You left ${itemCount} item(s) in your cart, including "${topItem}". Complete your purchase now and use code *${couponCode}* for an extra discount! 🎁`;
  const callToAction = storeUrl || "Reply to this message to complete your order!";

  return {
    body,
    callToAction,
  };
}
