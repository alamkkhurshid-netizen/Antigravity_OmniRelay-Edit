import { RetailProduct, RetailCategory } from "./catalog";
import { RetailOrder } from "./orders";

export interface WhatsAppListItem {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppListSection {
  title: string;
  rows: WhatsAppListItem[];
}

export interface WhatsAppInteractiveListMessage {
  type: "list";
  header?: { type: "text"; text: string };
  body: { text: string };
  footer?: { text: string };
  action: {
    button: string;
    sections: WhatsAppListSection[];
  };
}

/**
 * Builds an interactive WhatsApp list message for catalog browsing
 */
export function buildWhatsAppCatalogList(
  storeName: string,
  categories: RetailCategory[],
  featuredProducts: RetailProduct[]
): WhatsAppInteractiveListMessage {
  const sections: WhatsAppListSection[] = [];

  if (categories.length > 0) {
    sections.push({
      title: "Product Categories",
      rows: categories.slice(0, 5).map((cat) => ({
        id: `cat_${cat.id}`,
        title: cat.name.slice(0, 24),
        description: `Browse all ${cat.name}`,
      })),
    });
  }

  if (featuredProducts.length > 0) {
    sections.push({
      title: "Featured Products",
      rows: featuredProducts.slice(0, 5).map((p) => ({
        id: `prod_${p.sku}`,
        title: p.title.slice(0, 24),
        description: `₹${p.price.toLocaleString("en-IN")} • ${p.inventory_count > 0 ? "In Stock" : "Sold Out"}`,
      })),
    });
  }

  return {
    type: "list",
    header: { type: "text", text: `Welcome to ${storeName}` },
    body: {
      text: "Browse our store categories and top-selling products. Tap the button below to view items and place your order!",
    },
    footer: { text: "Secure WhatsApp Checkout" },
    action: {
      button: "View Catalog 🛍️",
      sections,
    },
  };
}

/**
 * Builds detailed text description for a specific product when viewed in WhatsApp
 */
export function buildWhatsAppProductDetailMessage(product: RetailProduct): {
  text: string;
  image_url: string;
  orderCommand: string;
} {
  const status = product.inventory_count > 0 ? "✅ In Stock" : "❌ Out of Stock";
  const desc = product.description ? `\n\n${product.description}` : "";
  const variants =
    product.variants && product.variants.length > 0
      ? `\n\n*Available Options:*\n` +
        product.variants
          .map((v) => `• ${v.title}: ₹${v.price} (${v.inventory_count > 0 ? "Available" : "Sold out"})`)
          .join("\n")
      : "";

  const text = `*${product.title}*\n*Price:* ₹${product.price.toLocaleString("en-IN")}\n*Status:* ${status}${desc}${variants}\n\nTo order, reply:\n*BUY ${product.sku}*`;

  return {
    text,
    image_url: product.image_link,
    orderCommand: `BUY ${product.sku}`,
  };
}

/**
 * Builds customer order status card for WhatsApp self-service lookup
 */
export function buildWhatsAppOrderStatusCard(order: RetailOrder): string {
  const shortId = order.id.slice(0, 8).toUpperCase();
  const dateStr = new Date(order.created_at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const statusEmojis: Record<string, string> = {
    new: "🆕 Received",
    confirmed: "✅ Confirmed",
    packing: "📦 Packing",
    preparing: "🍳 Preparing",
    shipping: "🚚 Shipped",
    shipped: "🚚 Shipped",
    delivered: "🎉 Delivered",
    completed: "✨ Completed",
    cancelled: "❌ Cancelled",
  };

  const statusDisplay = statusEmojis[order.status] || order.status.toUpperCase();
  const tracking = order.tracking_number
    ? `\n*Courier:* ${order.carrier || "Standard"}\n*Tracking ID:* ${order.tracking_number}${order.tracking_url ? `\n*Track Online:* ${order.tracking_url}` : ""}`
    : "";

  return `*Order #${shortId} Status*\n\n*Date:* ${dateStr}\n*Status:* ${statusDisplay}\n*Total:* ₹${Number(order.total_amount).toLocaleString("en-IN")}\n*Payment:* ${order.payment_status.toUpperCase()}${tracking}\n\nNeed help with this order? Reply to this message to connect with our support team.`;
}
