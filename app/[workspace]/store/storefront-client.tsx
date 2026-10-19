"use client";

import { useState } from "react";
import {
  ShoppingBag,
  Search,
  MessageCircle,
  Tag,
  Check,
  Plus,
  Minus,
  Trash2,
  X,
  ShieldCheck,
} from "lucide-react";
import { RetailProduct, RetailCategory } from "@/lib/retail/catalog";

interface CartItem {
  product: RetailProduct;
  quantity: number;
  variantId?: string;
  variantTitle?: string;
}

interface Props {
  organization: {
    id: string;
    name: string;
    phone: string;
    description: string;
    logoUrl?: string | null;
  };
  initialProducts: RetailProduct[];
  categories: RetailCategory[];
}

export function StorefrontClient({
  organization,
  initialProducts,
  categories,
}: Props) {
  const [products] = useState<RetailProduct[]>(initialProducts);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Filter products by category and search
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory ? p.category_id === selectedCategory : true;
    const matchesSearch = search
      ? p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
      : true;
    return matchesCategory && matchesSearch;
  });

  const addToCart = (product: RetailProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const discountAmount = appliedDiscount ? appliedDiscount.amount : 0;
  const total = Math.max(0, subtotal - discountAmount);
  const totalItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError(null);
    try {
      const res = await fetch("/api/retail/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", code: couponCode, subtotal }),
      });
      const data = await res.json();
      if (data.valid) {
        setAppliedDiscount({ code: couponCode.toUpperCase(), amount: data.discountAmount });
        setCouponError(null);
      } else {
        setCouponError(data.reason || "Invalid promo code");
      }
    } catch {
      setCouponError("Could not apply discount");
    }
  };

  const handleWhatsAppCheckout = () => {
    if (cart.length === 0) return;

    const cleanPhone = organization.phone.replace(/\D/g, "");
    const itemsList = cart
      .map((item) => `• ${item.product.title} (x${item.quantity}) - ₹${item.product.price * item.quantity}`)
      .join("\n");

    const promoText = appliedDiscount ? `\nPromo Applied: ${appliedDiscount.code} (-₹${appliedDiscount.amount})` : "";
    const message = `Hello ${organization.name}! 👋\n\nI would like to order the following items:\n${itemsList}\n${promoText}\n*Total Amount:* ₹${total.toLocaleString("en-IN")}\n\nPlease share payment and delivery details. Thank you!`;

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, "_blank");
  };

  const handleInstantBuy = (product: RetailProduct) => {
    const cleanPhone = organization.phone.replace(/\D/g, "");
    const message = `Hello ${organization.name}! 👋\n\nI would like to buy:\n• *${product.title}* (SKU: ${product.sku})\n• *Price:* ₹${product.price.toLocaleString("en-IN")}\n\nPlease confirm availability and delivery!`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  return (
    <div className="relative pb-24">
      {/* Store Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            {organization.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={organization.logoUrl}
                alt={organization.name}
                className="size-10 rounded-xl object-cover border border-slate-200"
              />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-bold text-lg shadow-sm">
                {organization.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-bold text-slate-900">{organization.name}</h1>
                <span className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="size-3 text-emerald-600" /> WhatsApp Verified
                </span>
              </div>
              <p className="text-xs text-slate-500">{organization.description}</p>
            </div>
          </div>

          <button
            onClick={() => setIsCartOpen(true)}
            className="relative flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-all"
          >
            <ShoppingBag className="size-4" />
            <span className="hidden sm:inline">Cart</span>
            {totalItemCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-indigo-500 text-[11px] font-bold text-white">
                {totalItemCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Search & Categories */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search products, brands, or SKUs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Categories Pill Navigation */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  selectedCategory === null
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                All Products
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                    selectedCategory === cat.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingBag className="size-12 text-slate-300 mb-3" />
            <h3 className="text-base font-semibold text-slate-700">No products found</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              Try adjusting your search query or selecting a different category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredProducts.map((p) => {
              const inStock = p.inventory_count > 0;
              return (
                <div
                  key={p.id}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-sm hover:shadow-md transition-all hover:border-indigo-200"
                >
                  <div className="relative aspect-square w-full bg-slate-100 overflow-hidden">
                    {p.image_link ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image_link}
                        alt={p.title}
                        className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">
                        <ShoppingBag className="size-10" />
                      </div>
                    )}
                    <span
                      className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${
                        inStock
                          ? "bg-emerald-500/90 text-white"
                          : "bg-rose-500/90 text-white"
                      }`}
                    >
                      {inStock ? "In Stock" : "Sold Out"}
                    </span>
                  </div>

                  <div className="p-4 flex flex-col flex-1 justify-between">
                    <div>
                      {p.brand && (
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-0.5">
                          {p.brand}
                        </p>
                      )}
                      <h3 className="font-semibold text-slate-900 line-clamp-1 text-sm">{p.title}</h3>
                      {p.description && (
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2">{p.description}</p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="flex items-baseline justify-between mb-3">
                        <span className="text-base font-extrabold text-slate-900">
                          ₹{Number(p.price).toLocaleString("en-IN")}
                        </span>
                        <span className="text-[11px] text-slate-400">SKU: {p.sku}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          disabled={!inStock}
                          onClick={() => addToCart(p)}
                          className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                          <ShoppingBag className="size-3.5" /> Cart
                        </button>
                        <button
                          disabled={!inStock}
                          onClick={() => handleInstantBuy(p)}
                          className="flex items-center justify-center gap-1 rounded-xl bg-[#25D366] py-2 text-xs font-bold text-white shadow-sm hover:bg-[#20ba59] transition-all disabled:opacity-50"
                        >
                          <MessageCircle className="size-3.5" /> Order
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart Slide-out Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="size-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">Shopping Cart ({totalItemCount})</h2>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto px-6 py-4 divide-y divide-slate-100">
              {cart.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <ShoppingBag className="size-12 text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">Your cart is empty</p>
                  <p className="text-xs text-slate-400 mt-1">Browse items from the store to add them here.</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.product.id} className="py-4 flex gap-3 items-center">
                    <div className="size-14 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                      {item.product.image_link ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.product.image_link}
                          alt={item.product.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <ShoppingBag className="size-6" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-semibold text-slate-900 truncate">{item.product.title}</h4>
                      <p className="text-xs font-bold text-slate-900 mt-0.5">
                        ₹{Number(item.product.price).toLocaleString("en-IN")}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                          <button
                            onClick={() => updateQuantity(item.product.id, -1)}
                            className="p-1 hover:bg-slate-200 rounded-l-lg text-slate-600"
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="px-2 text-xs font-bold text-slate-800">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.product.id, 1)}
                            className="p-1 hover:bg-slate-200 rounded-r-lg text-slate-600"
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-slate-400 hover:text-rose-500 p-1"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart Footer */}
            {cart.length > 0 && (
              <div className="border-t border-slate-200 bg-slate-50 p-6 space-y-4">
                {/* Coupon Code Input */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Promo Code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <button
                    onClick={applyCoupon}
                    className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
                  >
                    Apply
                  </button>
                </div>
                {couponError && <p className="text-[11px] text-rose-600 font-medium">{couponError}</p>}
                {appliedDiscount && (
                  <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="size-3" /> {appliedDiscount.code} applied (-₹{appliedDiscount.amount})
                  </p>
                )}

                {/* Subtotal breakdown */}
                <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-200">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>₹{subtotal.toLocaleString("en-IN")}</span>
                  </div>
                  {appliedDiscount && (
                    <div className="flex justify-between text-emerald-600 font-medium">
                      <span>Discount</span>
                      <span>-₹{discountAmount.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                    <span>Total Due</span>
                    <span>₹{total.toLocaleString("en-IN")}</span>
                  </div>
                </div>

                {/* WhatsApp Checkout Button */}
                <button
                  onClick={handleWhatsAppCheckout}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-sm font-bold text-white shadow-md hover:bg-[#20ba59] transition-all"
                >
                  <MessageCircle className="size-4" />
                  Checkout on WhatsApp
                </button>
                <p className="text-[10px] text-center text-slate-400">
                  You will connect directly with {organization.name} on WhatsApp to confirm payment & shipping.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
