import Link from "next/link";
import { ArrowLeft, Package, User, MapPin, Truck, Clock, ShieldCheck, Tag } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { OrderDetailActions } from "./order-detail-actions";
import { RetailOrderStatus } from "@/lib/retail/orders";

export default async function RetailOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");

  const { data: order, error } = await supabase
    .from("retail_orders")
    .select("*, retail_order_items(*)")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .single();

  if (error || !order) {
    notFound();
  }

  const items = order.retail_order_items || [];
  const timeline = (order.timeline || []) as Array<{
    status: RetailOrderStatus;
    timestamp: string;
    note?: string;
    author?: string;
  }>;

  const statusColors: Record<string, string> = {
    new: "bg-sky-100 text-sky-800 border-sky-200",
    confirmed: "bg-blue-100 text-blue-800 border-blue-200",
    packing: "bg-amber-100 text-amber-800 border-amber-200",
    preparing: "bg-amber-100 text-amber-800 border-amber-200",
    shipping: "bg-indigo-100 text-indigo-800 border-indigo-200",
    shipped: "bg-indigo-100 text-indigo-800 border-indigo-200",
    delivered: "bg-emerald-100 text-emerald-800 border-emerald-200",
    completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
    cancelled: "bg-rose-100 text-rose-800 border-rose-200",
  };

  return (
    <div className="mx-auto max-w-5xl py-6 px-4">
      <Link
        href="/app/retail/orders"
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="size-4" /> Back to Orders Board
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-6 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Order #{order.id.slice(0, 8).toUpperCase()}
            </h1>
            <span
              className={`px-3 py-1 text-xs font-semibold rounded-full border uppercase tracking-wider ${
                statusColors[order.status] || "bg-slate-100 text-slate-700 border-slate-200"
              }`}
            >
              {order.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Placed on{" "}
            {new Date(order.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        <OrderDetailActions
          orderId={order.id}
          currentStatus={order.status as RetailOrderStatus}
          currentCarrier={order.carrier}
          currentTrackingNumber={order.tracking_number}
          currentTrackingUrl={order.tracking_url}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Line Items & Summary */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Package className="size-5 text-indigo-600" /> Order Items ({items.length})
            </h2>

            <div className="divide-y divide-slate-100">
              {items.map((item: { id?: string; product_name: string; quantity: number; unit_price: number }, i: number) => (
                <div key={item.id || i} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{item.product_name}</p>
                    <p className="text-xs text-slate-500">
                      Qty: {item.quantity} × ₹{Number(item.unit_price).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <span className="font-semibold text-slate-900">
                    ₹{(Number(item.quantity) * Number(item.unit_price)).toLocaleString("en-IN")}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>₹{Number(order.total_amount + (order.discount_amount || 0)).toLocaleString("en-IN")}</span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span className="flex items-center gap-1">
                    <Tag className="size-3" /> Discount ({order.discount_code || "Promo"})
                  </span>
                  <span>-₹{Number(order.discount_amount).toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-100">
                <span>Total Paid / Due</span>
                <span>₹{Number(order.total_amount).toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          {/* Fulfillment Tracking Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Truck className="size-5 text-indigo-600" /> Shipping & Fulfillment
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Shipping Carrier</p>
                <p className="font-medium text-slate-900">{order.carrier || "Not specified"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Tracking Number</p>
                <p className="font-medium text-slate-900">{order.tracking_number || "None yet"}</p>
              </div>
            </div>
            {order.tracking_url && (
              <div className="mt-4">
                <a
                  href={order.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                >
                  Track Package Online →
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Customer Info & Timeline */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <User className="size-5 text-indigo-600" /> Customer Details
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">Full Name</p>
                <p className="font-semibold text-slate-900">{order.customer_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">WhatsApp / Phone</p>
                <a
                  href={`https://wa.me/${order.customer_phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-indigo-600 hover:underline"
                >
                  {order.customer_phone}
                </a>
              </div>
              <div>
                <p className="text-xs text-slate-500">Delivery Address</p>
                <p className="font-medium text-slate-800 flex items-start gap-1">
                  <MapPin className="size-4 text-slate-400 mt-0.5 shrink-0" />
                  {order.customer_address || "Pick up at store"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Payment Status</p>
                <span className="inline-flex items-center gap-1 mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 uppercase">
                  <ShieldCheck className="size-3 text-emerald-600" /> {order.payment_status}
                </span>
              </div>
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Clock className="size-5 text-indigo-600" /> Order History
            </h2>

            {timeline.length === 0 ? (
              <p className="text-xs text-slate-400">No events recorded yet.</p>
            ) : (
              <div className="space-y-4 border-l-2 border-slate-100 pl-4 ml-2">
                {timeline.map((evt, idx) => (
                  <div key={idx} className="relative">
                    <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
                    <p className="text-xs font-semibold text-slate-900 uppercase">{evt.status}</p>
                    <p className="text-xs text-slate-500">{evt.note}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(evt.timestamp).toLocaleString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
