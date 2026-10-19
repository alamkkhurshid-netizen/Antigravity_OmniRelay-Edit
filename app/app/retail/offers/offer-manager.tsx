"use client";

import { useState } from "react";
import { Plus, Tag, Calendar, Check, Loader2, Award, Sparkles } from "lucide-react";

interface Discount {
  id: string;
  code: string;
  description?: string | null;
  discount_type: string;
  value: number;
  min_order_amount: number;
  max_discount_amount?: number | null;
  times_used: number;
  is_active: boolean;
  expires_at?: string | null;
}

interface Props {
  initialDiscounts: Discount[];
  organizationId: string;
}

export function OfferManager({ initialDiscounts }: Props) {
  const [discounts, setDiscounts] = useState<Discount[]>(initialDiscounts);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form State
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const handleCreateDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !value) return;

    setLoading(true);
    try {
      const res = await fetch("/api/retail/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          description,
          discount_type: discountType,
          value: Number(value),
          min_order_amount: minOrder ? Number(minOrder) : 0,
          max_discount_amount: maxDiscount ? Number(maxDiscount) : null,
          expires_at: expiresAt || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create discount");
      } else {
        const data = await res.json();
        setDiscounts([data.discount, ...discounts]);
        setShowModal(false);
        setCode("");
        setDescription("");
        setValue("");
        setMinOrder("");
        setMaxDiscount("");
        setExpiresAt("");
      }
    } catch {
      alert("Error creating discount");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Discount Codes Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Tag className="size-4 text-indigo-600" /> Active Promo Codes
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Coupons can be applied at WhatsApp checkout or in the digital store.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-all"
          >
            <Plus className="size-3.5" /> Create Coupon
          </button>
        </div>

        {discounts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
            <Tag className="size-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No promo codes yet</p>
            <p className="text-xs text-slate-400 mt-0.5">Create your first coupon code like WELCOME10 or FESTIVE20.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {discounts.map((d) => (
              <div
                key={d.id}
                className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      {d.code}
                    </span>
                    <span className="text-xs font-semibold text-emerald-600">
                      {d.discount_type === "percentage" ? `${d.value}% OFF` : `₹${d.value} OFF`}
                    </span>
                  </div>
                  {d.description && (
                    <p className="text-xs text-slate-600 mt-2 line-clamp-1">{d.description}</p>
                  )}
                  <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                    {d.min_order_amount > 0 && <p>Min Order: ₹{d.min_order_amount}</p>}
                    {d.max_discount_amount && <p>Max Cap: ₹{d.max_discount_amount}</p>}
                    {d.expires_at && (
                      <p className="flex items-center gap-1">
                        <Calendar className="size-3 text-slate-400" />
                        Expires: {new Date(d.expires_at).toLocaleDateString("en-IN")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Used {d.times_used} times</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-0.5">
                    <Check className="size-3" /> Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Automated Loyalty Tiers Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Award className="size-5 text-amber-500" /> Automated Customer Loyalty Tiers
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Customers automatically unlock higher tiers and personalized WhatsApp rewards based on order volume.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 p-4 bg-white shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tier 1</span>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">New</span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Bronze</h3>
              <p className="text-xs text-slate-500 mt-1">Starting tier for all new buyers.</p>
              <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-emerald-600 shrink-0" /> Standard Order Support
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-emerald-600 shrink-0" /> WhatsApp Updates
                </li>
              </ul>
            </div>
            <p className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 font-medium">
              Spend: ₹0+
            </p>
          </div>

          <div className="rounded-xl border border-indigo-200 p-4 bg-indigo-50/20 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Tier 2</span>
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">5% OFF</span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Silver</h3>
              <p className="text-xs text-slate-500 mt-1">Repeat shoppers with 2+ completed orders.</p>
              <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-emerald-600 shrink-0" /> 5% Off Automatic Discount
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-emerald-600 shrink-0" /> Early Access to Drops
                </li>
              </ul>
            </div>
            <p className="mt-4 pt-3 border-t border-indigo-100 text-[11px] text-indigo-600 font-medium">
              Spend: ₹3,000+ or 2 orders
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 p-4 bg-amber-50/20 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Tier 3</span>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">10% OFF</span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Gold</h3>
              <p className="text-xs text-slate-500 mt-1">High-value repeat customers.</p>
              <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-emerald-600 shrink-0" /> 10% Off All Orders
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-emerald-600 shrink-0" /> Free Express Shipping
                </li>
              </ul>
            </div>
            <p className="mt-4 pt-3 border-t border-amber-100 text-[11px] text-amber-700 font-medium">
              Spend: ₹10,000+ or 5 orders
            </p>
          </div>

          <div className="rounded-xl border border-purple-200 p-4 bg-purple-50/20 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">VIP Tier</span>
                <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">15% OFF</span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-1">
                Platinum <Sparkles className="size-4 text-purple-600" />
              </h3>
              <p className="text-xs text-slate-500 mt-1">Top 5% of all buyers across your store.</p>
              <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-emerald-600 shrink-0" /> 15% Off Everything
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-emerald-600 shrink-0" /> Dedicated WhatsApp Concierge
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 text-emerald-600 shrink-0" /> Surprise Gift with Every Order
                </li>
              </ul>
            </div>
            <p className="mt-4 pt-3 border-t border-purple-100 text-[11px] text-purple-700 font-medium">
              Spend: ₹25,000+ or 10 orders
            </p>
          </div>
        </div>
      </div>

      {/* Modal for Creating Discount */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Tag className="size-5 text-indigo-600" /> Create New Promo Code
            </h3>

            <form onSubmit={handleCreateDiscount} className="space-y-4 text-sm">
              <div>
                <label className="text-xs font-semibold text-slate-700">Coupon Code</label>
                <input
                  type="text"
                  placeholder="e.g. WELCOME10"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full mt-1 px-3 py-2 border rounded-xl text-sm border-slate-200 uppercase font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Description</label>
                <input
                  type="text"
                  placeholder="e.g. 10% off on your first purchase"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Discount Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
                    className="w-full mt-1 px-3 py-2 border rounded-xl text-sm border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Value</label>
                  <input
                    type="number"
                    min="1"
                    placeholder={discountType === "percentage" ? "10" : "150"}
                    required
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Min Order Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={minOrder}
                    onChange={(e) => setMinOrder(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Max Discount (₹, Optional)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="500"
                    value={maxDiscount}
                    onChange={(e) => setMaxDiscount(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Expires At (Optional)</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-xl text-sm border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading && <Loader2 className="size-3.5 animate-spin" />}
                  Save Coupon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
