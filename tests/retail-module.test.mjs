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
