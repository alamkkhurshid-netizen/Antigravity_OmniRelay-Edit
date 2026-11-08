export interface ProductVariant {
  id: string;
  sku: string;
  title: string;
  options: Record<string, string>; // e.g. { size: "M", color: "Navy" }
  price: number;
  inventory_count: number;
  barcode?: string;
}

export interface RetailProduct {
  id: string;
  organization_id: string;
  category_id?: string | null;
  sku: string;
  title: string;
  description?: string | null;
  availability: "in stock" | "out of stock" | "preorder";
  condition: "new" | "refurbished" | "used";
  price: number;
  currency: string;
  link: string;
  image_link: string;
  images: string[];
  brand?: string | null;
  inventory_count: number;
  variants: ProductVariant[];
  low_stock_threshold: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface RetailCategory {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  display_order: number;
  image_url?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Filter and query products with inventory warnings
 */
export function evaluateProductStock(product: {
  inventory_count: number;
  low_stock_threshold?: number;
  variants?: ProductVariant[];
}): { isOutOfStock: boolean; isLowStock: boolean; totalStock: number } {
  const threshold = product.low_stock_threshold ?? 5;
  const variantTotal = product.variants && product.variants.length > 0
    ? product.variants.reduce((sum, v) => sum + (v.inventory_count || 0), 0)
    : product.inventory_count;

  return {
    totalStock: variantTotal,
    isOutOfStock: variantTotal <= 0,
    isLowStock: variantTotal > 0 && variantTotal <= threshold,
  };
}

/**
 * Slugify category title for URL & Meta indexing
 */
export function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Meta Catalog Batch Payload generation (for Graph API v21.0 /{catalog_id}/batch)
 */
export function buildMetaCatalogBatchPayload(products: RetailProduct[]): {
  requests: Array<{
    method: "CREATE" | "UPDATE";
    retailer_id: string;
    data: Record<string, unknown>;
  }>;
} {
  return {
    requests: products.map((p) => ({
      method: "UPDATE",
      retailer_id: p.sku,
      data: {
        id: p.sku,
        title: p.title,
        description: p.description || p.title,
        availability: p.inventory_count > 0 ? "in stock" : "out of stock",
        condition: p.condition || "new",
        price: `${Math.round(p.price * 100)} ${p.currency || "INR"}`,
        link: p.link,
        image_link: p.image_link,
        brand: p.brand || "Retail",
        inventory: p.inventory_count,
        additional_image_cdn_urls: p.images || [],
      },
    })),
  };
}

/**
 * Format Product for WhatsApp Catalog / Interactive Commerce
 */
export function formatProductForWhatsApp(product: RetailProduct): {
  retailer_id: string;
  name: string;
  amount: number;
  currency: string;
  summary: string;
} {
  return {
    retailer_id: product.sku,
    name: product.title,
    amount: product.price,
    currency: product.currency || "INR",
    summary: `₹${product.price.toLocaleString("en-IN")} • ${product.inventory_count > 0 ? "In Stock" : "Sold Out"}`,
  };
}
