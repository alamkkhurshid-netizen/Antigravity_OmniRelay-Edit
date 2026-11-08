export type DiscountType = "percentage" | "fixed" | "bundle";

export interface RetailDiscount {
  id: string;
  organization_id: string;
  code: string;
  description?: string | null;
  discount_type: DiscountType;
  value: number;
  min_order_amount: number;
  max_discount_amount?: number | null;
  usage_limit?: number | null;
  times_used: number;
  is_active: boolean;
  expires_at?: string | null;
}

export interface DiscountCalculationResult {
  valid: boolean;
  discountAmount: number;
  finalAmount: number;
  reason?: string;
}

/**
 * Validates and calculates discount on an order
 */
export function calculateDiscount(
  discount: RetailDiscount,
  orderSubtotal: number
): DiscountCalculationResult {
  if (!discount.is_active) {
    return { valid: false, discountAmount: 0, finalAmount: orderSubtotal, reason: "Coupon is not active" };
  }

  if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
    return { valid: false, discountAmount: 0, finalAmount: orderSubtotal, reason: "Coupon has expired" };
  }

  if (discount.usage_limit && discount.times_used >= discount.usage_limit) {
    return { valid: false, discountAmount: 0, finalAmount: orderSubtotal, reason: "Coupon usage limit reached" };
  }

  if (orderSubtotal < discount.min_order_amount) {
    return {
      valid: false,
      discountAmount: 0,
      finalAmount: orderSubtotal,
      reason: `Minimum order amount of ₹${discount.min_order_amount} required`,
    };
  }

  let calculatedDiscount = 0;

  if (discount.discount_type === "percentage") {
    calculatedDiscount = Math.round(((orderSubtotal * discount.value) / 100) * 100) / 100;
    if (discount.max_discount_amount && calculatedDiscount > discount.max_discount_amount) {
      calculatedDiscount = discount.max_discount_amount;
    }
  } else if (discount.discount_type === "fixed") {
    calculatedDiscount = Math.min(discount.value, orderSubtotal);
  } else if (discount.discount_type === "bundle") {
    calculatedDiscount = Math.min(discount.value, orderSubtotal);
  }

  const finalAmount = Math.max(0, Math.round((orderSubtotal - calculatedDiscount) * 100) / 100);

  return {
    valid: true,
    discountAmount: calculatedDiscount,
    finalAmount,
  };
}

/**
 * Loyalty Tier Resolver based on customer purchase history
 */
export function resolveLoyaltyTier(totalSpent: number, orderCount: number): {
  tier: "Bronze" | "Silver" | "Gold" | "Platinum";
  discountPercent: number;
  perks: string[];
} {
  if (totalSpent >= 25000 || orderCount >= 10) {
    return {
      tier: "Platinum",
      discountPercent: 15,
      perks: ["15% Off All Orders", "Priority WhatsApp Support", "Free Shipping"],
    };
  }
  if (totalSpent >= 10000 || orderCount >= 5) {
    return {
      tier: "Gold",
      discountPercent: 10,
      perks: ["10% Off All Orders", "Free Shipping on orders > ₹500"],
    };
  }
  if (totalSpent >= 3000 || orderCount >= 2) {
    return {
      tier: "Silver",
      discountPercent: 5,
      perks: ["5% Off All Orders"],
    };
  }
  return {
    tier: "Bronze",
    discountPercent: 0,
    perks: ["Standard Member"],
  };
}
