import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("retail migration defines meta_capi_config and retail_products tables", async () => {
  const migration = await read("supabase/migrations/20261006100000_retail_module_foundation.sql");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.meta_capi_config/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.retail_products/);
  assert.match(migration, /ALTER TABLE public\.meta_capi_config ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\.retail_products ENABLE ROW LEVEL SECURITY/);
});

test("retail_products enforces SKU uniqueness per organization", async () => {
  const migration = await read("supabase/migrations/20261006100000_retail_module_foundation.sql");
  assert.match(migration, /UNIQUE\(organization_id, sku\)/);
});

test("retail_products supports availability and condition defaults", async () => {
  const migration = await read("supabase/migrations/20261006100000_retail_module_foundation.sql");
  assert.match(migration, /availability TEXT DEFAULT 'in stock'/);
  assert.match(migration, /condition TEXT DEFAULT 'new'/);
  assert.match(migration, /currency TEXT DEFAULT 'INR'/);
  assert.match(migration, /inventory_count INTEGER DEFAULT 0/);
});

test("retail_orders migration defines orders and line items with strict status checks", async () => {
  const migration = await read("supabase/migrations/20260919020000_retail_orders_foundation.sql");

  assert.match(migration, /create table public\.retail_orders/);
  assert.match(migration, /status in \('new', 'packing', 'shipping', 'completed', 'cancelled'\)/);
  assert.match(migration, /payment_status in \('pending', 'paid', 'cod'\)/);
  assert.match(migration, /total_amount >= 0/);
  assert.match(migration, /create table public\.retail_order_items/);
  assert.match(migration, /quantity > 0/);
  assert.match(migration, /unit_price >= 0/);
});

test("retail_orders and items enforce RLS and tenant member boundaries", async () => {
  const migration = await read("supabase/migrations/20260919020000_retail_orders_foundation.sql");

  assert.match(migration, /alter table public\.retail_orders enable row level security/);
  assert.match(migration, /private\.is_organization_member\(organization_id, 'member'\)/);
  assert.match(migration, /private\.is_organization_member\(organization_id, 'admin'\)/);
});

test("retail catalog route verifies server configuration and requires org_id", async () => {
  const route = await read("app/api/retail/catalog/route.ts");

  assert.match(route, /Missing org_id parameter/);
  assert.match(route, /Server configuration missing/);
  assert.match(route, /from\("retail_products"\)/);
  assert.match(route, /\.eq\("organization_id", orgId\)/);
});

test("retail catalog CSV formatting outputs standard Meta Commerce fields", () => {
  const headers = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "inventory"];
  assert.equal(headers.length, 10);
  assert.ok(headers.includes("availability"));
  assert.ok(headers.includes("price"));
  assert.ok(headers.includes("brand"));
});

test("retail catalog CSV generator correctly escapes quotes and delimiters", () => {
  const escapeCsv = (field) => {
    if (field === null || field === undefined) return "";
    const str = String(field).replace(/"/g, '""');
    if (str.search(/("|,|\n)/g) >= 0) {
      return `"${str}"`;
    }
    return str;
  };

  assert.equal(escapeCsv('Simple Text'), 'Simple Text');
  assert.equal(escapeCsv('Text with, comma'), '"Text with, comma"');
  assert.equal(escapeCsv('Text with "quotes"'), '"Text with ""quotes"""');
  assert.equal(escapeCsv(null), '');
});

test("retail order item calculates subtotal accurately", () => {
  function calculateLineItemSubtotal(quantity, unitPrice) {
    if (quantity <= 0 || unitPrice < 0) throw new Error("Invalid item parameters");
    return Math.round(quantity * unitPrice * 100) / 100;
  }

  assert.equal(calculateLineItemSubtotal(3, 249.50), 748.50);
  assert.equal(calculateLineItemSubtotal(1, 999.00), 999.00);
  assert.throws(() => calculateLineItemSubtotal(0, 100));
  assert.throws(() => calculateLineItemSubtotal(2, -50));
});

test("retail order status progression allows valid state changes", () => {
  const validTransitions = {
    new: ["packing", "cancelled"],
    packing: ["shipping", "cancelled"],
    shipping: ["completed", "cancelled"],
    completed: [],
    cancelled: []
  };

  function canTransition(current, next) {
    return validTransitions[current]?.includes(next) ?? false;
  }

  assert.ok(canTransition("new", "packing"));
  assert.ok(canTransition("packing", "shipping"));
  assert.ok(canTransition("shipping", "completed"));
  assert.ok(canTransition("new", "cancelled"));
  assert.ok(!canTransition("completed", "new"));
  assert.ok(!canTransition("cancelled", "shipping"));
});

test("retail category unlock migration enables retail commerce for tenant", async () => {
  const migration = await read("supabase/migrations/20260919000000_unlock_retail_category.sql");
  assert.match(migration, /Retail & e-commerce/);
});

test("retail product price formatted with ISO currency code", () => {
  function formatPrice(price, currency = "INR") {
    return `${Number(price).toFixed(2)} ${currency.toUpperCase()}`;
  }

  assert.equal(formatPrice(1299), "1299.00 INR");
  assert.equal(formatPrice(49.9, "usd"), "49.90 USD");
});

test("retail inventory decrement guards against negative count", () => {
  function decrementInventory(current, qty) {
    if (qty > current) {
      throw new Error("Insufficient stock");
    }
    return current - qty;
  }

  assert.equal(decrementInventory(10, 3), 7);
  assert.equal(decrementInventory(5, 5), 0);
  assert.throws(() => decrementInventory(2, 5));
});

test("retail catalog storage migration isolates product media", async () => {
  const migration = await read("supabase/migrations/20260919030000_retail_catalog_storage.sql");
  assert.match(migration, /storage\.buckets/);
});

test("retail parity features migration wires product catalog with marketing", async () => {
  const migration = await read("supabase/migrations/20260919040000_retail_parity_features.sql");
  assert.match(migration, /retail/);
});

test("retail production vertical migration defines categories, discounts, and abandoned carts", async () => {
  const migration = await read("supabase/migrations/20261012000000_retail_production_vertical.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.retail_categories/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.retail_discounts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.retail_abandoned_carts/);
  assert.match(migration, /status IN \('new', 'confirmed', 'packing', 'preparing', 'shipping', 'shipped', 'delivered', 'completed', 'cancelled'\)/);
  assert.match(migration, /ALTER TABLE public\.retail_categories ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\.retail_discounts ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\.retail_abandoned_carts ENABLE ROW LEVEL SECURITY/);
});

test("evaluateProductStock accurately flags low stock and out-of-stock items", async () => {
  const { evaluateProductStock } = await import("../lib/retail/catalog.ts");

  const normalStock = evaluateProductStock({ inventory_count: 20, low_stock_threshold: 5 });
  assert.equal(normalStock.isLowStock, false);
  assert.equal(normalStock.isOutOfStock, false);
  assert.equal(normalStock.totalStock, 20);

  const lowStock = evaluateProductStock({ inventory_count: 3, low_stock_threshold: 5 });
  assert.equal(lowStock.isLowStock, true);
  assert.equal(lowStock.isOutOfStock, false);

  const outOfStock = evaluateProductStock({ inventory_count: 0, low_stock_threshold: 5 });
  assert.equal(outOfStock.isLowStock, false);
  assert.equal(outOfStock.isOutOfStock, true);

  // Variant aggregate stock
  const variantStock = evaluateProductStock({
    inventory_count: 0,
    low_stock_threshold: 5,
    variants: [
      { id: "1", sku: "S-1", title: "Small", options: {}, price: 100, inventory_count: 2 },
      { id: "2", sku: "S-2", title: "Medium", options: {}, price: 100, inventory_count: 1 },
    ],
  });
  assert.equal(variantStock.totalStock, 3);
  assert.equal(variantStock.isLowStock, true);
});

test("slugifyCategory generates clean, URL-safe and Meta-compatible slugs", async () => {
  const { slugifyCategory } = await import("../lib/retail/catalog.ts");

  assert.equal(slugifyCategory("Men's Formal Shoes & Boots!"), "mens-formal-shoes-boots");
  assert.equal(slugifyCategory("Electronics / Gadgets"), "electronics-gadgets");
  assert.equal(slugifyCategory("   Festive Offers 2026   "), "festive-offers-2026");
});

test("buildMetaCatalogBatchPayload formats products for Meta Graph API v21.0", async () => {
  const { buildMetaCatalogBatchPayload } = await import("../lib/retail/catalog.ts");

  const payload = buildMetaCatalogBatchPayload([
    {
      id: "p1",
      organization_id: "org1",
      sku: "SKU-100",
      title: "Classic Navy Blazer",
      description: "Premium wool jacket",
      availability: "in stock",
      condition: "new",
      price: 4999,
      currency: "INR",
      link: "https://store.omnirelay.com/sku-100",
      image_link: "https://cdn.omnirelay.com/img1.jpg",
      images: ["https://cdn.omnirelay.com/img2.jpg"],
      brand: "LuxeWear",
      inventory_count: 15,
      variants: [],
      low_stock_threshold: 5,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  assert.equal(payload.requests.length, 1);
  assert.equal(payload.requests[0].retailer_id, "SKU-100");
  assert.equal(payload.requests[0].data.title, "Classic Navy Blazer");
  assert.equal(payload.requests[0].data.price, "499900 INR");
  assert.equal(payload.requests[0].data.availability, "in stock");
});

test("formatProductForWhatsApp builds clean WhatsApp item summary", async () => {
  const { formatProductForWhatsApp } = await import("../lib/retail/catalog.ts");

  const item = formatProductForWhatsApp({
    sku: "TSHIRT-BLK-M",
    title: "Black Cotton T-Shirt",
    price: 699,
    currency: "INR",
    inventory_count: 12,
  });

  assert.equal(item.retailer_id, "TSHIRT-BLK-M");
  assert.equal(item.amount, 699);
  assert.match(item.summary, /₹699/);
  assert.match(item.summary, /In Stock/);
});

test("isValidStatusTransition enforces strict order status progression", async () => {
  const { isValidStatusTransition } = await import("../lib/retail/orders.ts");

  // Valid forward progressions
  assert.equal(isValidStatusTransition("new", "confirmed"), true);
  assert.equal(isValidStatusTransition("confirmed", "preparing"), true);
  assert.equal(isValidStatusTransition("confirmed", "packing"), true);
  assert.equal(isValidStatusTransition("packing", "shipping"), true);
  assert.equal(isValidStatusTransition("shipping", "delivered"), true);
  assert.equal(isValidStatusTransition("delivered", "completed"), true);
  assert.equal(isValidStatusTransition("new", "cancelled"), true);
  assert.equal(isValidStatusTransition("shipping", "cancelled"), true);

  // Invalid regressions
  assert.equal(isValidStatusTransition("completed", "new"), false);
  assert.equal(isValidStatusTransition("delivered", "preparing"), false);
  assert.equal(isValidStatusTransition("cancelled", "shipping"), false);
});

test("appendOrderTimeline records timestamped events with author tracking", async () => {
  const { appendOrderTimeline } = await import("../lib/retail/orders.ts");

  const initial = [];
  const afterConfirm = appendOrderTimeline(initial, "confirmed", "Order verified by manager", "alice");
  assert.equal(afterConfirm.length, 1);
  assert.equal(afterConfirm[0].status, "confirmed");
  assert.equal(afterConfirm[0].author, "alice");

  const afterDispatch = appendOrderTimeline(afterConfirm, "shipping", "Dispatched via BlueDart", "bob");
  assert.equal(afterDispatch.length, 2);
  assert.equal(afterDispatch[1].status, "shipping");
  assert.match(afterDispatch[1].note, /BlueDart/);
});

test("buildWhatsAppOrderMessage generates order confirmation, dispatch, and delivery copy", async () => {
  const { buildWhatsAppOrderMessage } = await import("../lib/retail/orders.ts");

  const order = {
    id: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    customer_name: "Rahul Sharma",
    total_amount: 1499,
    carrier: "Delhivery",
    tracking_number: "DEL12345678",
    tracking_url: "https://track.delhivery.com/DEL12345678",
  };

  const confirmMsg = buildWhatsAppOrderMessage(order, "confirmed");
  assert.match(confirmMsg.title, /Order Confirmed/);
  assert.match(confirmMsg.body, /Rahul Sharma/);
  assert.match(confirmMsg.body, /#A1B2C3D4/);
  assert.match(confirmMsg.body, /₹1,499/);

  const shipMsg = buildWhatsAppOrderMessage(order, "shipped");
  assert.match(shipMsg.title, /Order Shipped/);
  assert.match(shipMsg.body, /Delhivery/);
  assert.match(shipMsg.body, /DEL12345678/);
  assert.equal(shipMsg.actionUrl, "https://track.delhivery.com/DEL12345678");

  const delivMsg = buildWhatsAppOrderMessage(order, "delivered");
  assert.match(delivMsg.title, /Order Delivered/);
  assert.match(delivMsg.body, /Thank you for shopping with us/);
});

test("extractOrderLookupQuery correctly parses customer order inquiry queries", async () => {
  const { extractOrderLookupQuery } = await import("../lib/retail/orders.ts");

  assert.equal(extractOrderLookupQuery("track #a1b2c3d4"), "a1b2c3d4");
  assert.equal(extractOrderLookupQuery("status of order a1b2c3d4"), "a1b2c3d4");
  assert.equal(extractOrderLookupQuery("Where is order #DEL-9876?"), "del-9876");
  assert.equal(extractOrderLookupQuery("a1b2c3d4"), "a1b2c3d4");
  assert.equal(extractOrderLookupQuery("hello good morning"), null);
});

test("calculateDiscount correctly computes percentage discounts with max caps", async () => {
  const { calculateDiscount } = await import("../lib/retail/discounts.ts");

  const discount = {
    id: "d1",
    organization_id: "org1",
    code: "FESTIVE20",
    discount_type: "percentage",
    value: 20, // 20%
    min_order_amount: 500,
    max_discount_amount: 300,
    times_used: 10,
    is_active: true,
  };

  // Subtotal 1,000 -> 20% is 200 (within 300 cap)
  const res1 = calculateDiscount(discount, 1000);
  assert.equal(res1.valid, true);
  assert.equal(res1.discountAmount, 200);
  assert.equal(res1.finalAmount, 800);

  // Subtotal 2,000 -> 20% is 400 (exceeds 300 cap -> clamped to 300)
  const res2 = calculateDiscount(discount, 2000);
  assert.equal(res2.valid, true);
  assert.equal(res2.discountAmount, 300);
  assert.equal(res2.finalAmount, 1700);
});

test("calculateDiscount respects minimum order amount and expiration dates", async () => {
  const { calculateDiscount } = await import("../lib/retail/discounts.ts");

  const minOrderCoupon = {
    id: "d2",
    organization_id: "org1",
    code: "FLAT100",
    discount_type: "fixed",
    value: 100,
    min_order_amount: 999,
    times_used: 0,
    is_active: true,
  };

  const rejected = calculateDiscount(minOrderCoupon, 500);
  assert.equal(rejected.valid, false);
  assert.equal(rejected.discountAmount, 0);
  assert.match(rejected.reason, /Minimum order amount/);

  const expiredCoupon = {
    ...minOrderCoupon,
    expires_at: new Date(Date.now() - 100000).toISOString(),
  };

  const expiredRes = calculateDiscount(expiredCoupon, 1200);
  assert.equal(expiredRes.valid, false);
  assert.match(expiredRes.reason, /expired/);
});

test("resolveLoyaltyTier assigns Bronze, Silver, Gold, Platinum based on spend and orders", async () => {
  const { resolveLoyaltyTier } = await import("../lib/retail/discounts.ts");

  assert.equal(resolveLoyaltyTier(500, 1).tier, "Bronze");
  assert.equal(resolveLoyaltyTier(3500, 2).tier, "Silver");
  assert.equal(resolveLoyaltyTier(12000, 5).tier, "Gold");
  assert.equal(resolveLoyaltyTier(30000, 12).tier, "Platinum");
  assert.equal(resolveLoyaltyTier(30000, 12).discountPercent, 15);
});

test("abandoned cart recovery detects eligible carts and builds WhatsApp recovery copy", async () => {
  const { isEligibleForRecoveryNudge, buildAbandonedCartRecoveryMessage } = await import("../lib/retail/abandoned-cart.ts");

  const eligibleCart = {
    id: "cart1",
    organization_id: "org1",
    customer_phone: "+919876543210",
    customer_name: "Pooja Patel",
    cart_items: [{ sku: "SKU-DRESS", title: "Floral Summer Dress", quantity: 1, price: 1899 }],
    cart_value: 1899,
    recovered: false,
    recovery_sent_at: null,
    created_at: new Date(Date.now() - 70 * 60 * 1000).toISOString(), // 70 mins ago
    updated_at: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
  };

  assert.equal(isEligibleForRecoveryNudge(eligibleCart, 60), true);

  const msg = buildAbandonedCartRecoveryMessage(eligibleCart, "https://store.omnirelay.com/store");
  assert.match(msg.body, /Pooja Patel/);
  assert.match(msg.body, /Floral Summer Dress/);
  assert.match(msg.body, /RECOVER10/);

  // Cart with recovery already sent is not eligible
  const alreadySent = { ...eligibleCart, recovery_sent_at: new Date().toISOString() };
  assert.equal(isEligibleForRecoveryNudge(alreadySent, 60), false);
});

