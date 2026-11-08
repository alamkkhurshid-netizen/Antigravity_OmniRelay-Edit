"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, XCircle, Truck, Loader2 } from "lucide-react";
import { RetailOrderStatus, VALID_ORDER_TRANSITIONS } from "@/lib/retail/orders";

interface Props {
  orderId: string;
  currentStatus: RetailOrderStatus;
  currentCarrier?: string | null;
  currentTrackingNumber?: string | null;
  currentTrackingUrl?: string | null;
}

export function OrderDetailActions({
  orderId,
  currentStatus,
  currentCarrier,
  currentTrackingNumber,
  currentTrackingUrl,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showFulfillmentModal, setShowFulfillmentModal] = useState(false);
  const [carrier, setCarrier] = useState(currentCarrier || "");
  const [trackingNumber, setTrackingNumber] = useState(currentTrackingNumber || "");
  const [trackingUrl, setTrackingUrl] = useState(currentTrackingUrl || "");

  const allowedNext = VALID_ORDER_TRANSITIONS[currentStatus] || [];
  const primaryNext = allowedNext.find((s) => s !== "cancelled");

  const handleStatusChange = async (nextStatus: RetailOrderStatus, extraPayload: Record<string, unknown> = {}) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/retail/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          ...extraPayload,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update order status");
      } else {
        router.refresh();
      }
    } catch {
      alert("Error updating order status");
    } finally {
      setLoading(false);
      setShowFulfillmentModal(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* If next step is shipping, prompt for fulfillment details */}
      {primaryNext && (
        <button
          disabled={loading}
          onClick={() => {
            if (primaryNext === "shipping" || primaryNext === "shipped") {
              setShowFulfillmentModal(true);
            } else {
              handleStatusChange(primaryNext);
            }
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          Advance to {primaryNext.toUpperCase()}
          <ChevronRight className="size-4" />
        </button>
      )}

      {currentStatus !== "cancelled" && currentStatus !== "completed" && currentStatus !== "delivered" && (
        <button
          disabled={loading}
          onClick={() => {
            if (confirm("Are you sure you want to cancel this order?")) {
              handleStatusChange("cancelled", { notes: "Cancelled by store operator" });
            }
          }}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 transition-all disabled:opacity-50"
        >
          <XCircle className="size-4" /> Cancel
        </button>
      )}

      {/* Fulfillment Modal for Shipping */}
      {showFulfillmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
              <Truck className="size-5 text-indigo-600" /> Enter Shipping Details
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Add courier and tracking information. A dispatch update will be sent to the customer on WhatsApp.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Courier / Carrier</label>
                <input
                  type="text"
                  placeholder="e.g. BlueDart, Delhivery, DTDC"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Tracking Number / AWB</label>
                <input
                  type="text"
                  placeholder="e.g. BLD129482049"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Tracking URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://track.bluedart.com/..."
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFulfillmentModal(false)}
                className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  handleStatusChange(primaryNext || "shipping", {
                    carrier: carrier || "Standard Courier",
                    tracking_number: trackingNumber || null,
                    tracking_url: trackingUrl || null,
                    notes: `Dispatched with ${carrier || "carrier"} (AWB: ${trackingNumber || "N/A"})`,
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading && <Loader2 className="size-4 animate-spin" />}
                Confirm & Dispatch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
