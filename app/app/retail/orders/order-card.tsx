import { Clock, Phone, ShoppingBag, MessageCircle, MapPin } from "lucide-react";

export type RetailOrder = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  status: string;
  payment_status: string;
  total_amount: number;
  created_at: string;
  items?: {
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
  }[];
};

export function OrderCard({ order, onMoveNext, nextActionLabel, disabled }: { order: RetailOrder; onMoveNext?: () => void; nextActionLabel?: string; disabled?: boolean; }) {
  const timeAgo = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  }).format(new Date(order.created_at));

  const itemsText = order.items && order.items.length > 0 
    ? `${order.items.length} item${order.items.length > 1 ? "s" : ""} • ${order.items.slice(0,2).map(i => i.product_name).join(", ")}${order.items.length > 2 ? "..." : ""}`
    : "No items listed";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-900">{order.customer_name}</h3>
          <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Clock className="size-3" /> {timeAgo}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-black text-slate-900">₹{order.total_amount}</span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            order.payment_status === "paid" ? "bg-emerald-100 text-emerald-700" :
            order.payment_status === "cod" ? "bg-amber-100 text-amber-700" :
            "bg-slate-100 text-slate-600"
          }`}>
            {order.payment_status}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
        <span className="flex items-start gap-1.5">
          <ShoppingBag className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
          <span className="line-clamp-2 leading-snug">{itemsText}</span>
        </span>
        
        {order.customer_address && (
          <span className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
            <span className="line-clamp-1 truncate leading-snug">{order.customer_address}</span>
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-2">
        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
          <Phone className="size-3" /> {order.customer_phone}
        </span>
        
        <button 
          onClick={(e) => {
            e.stopPropagation(); // prevent drag
            window.open(`https://wa.me/${order.customer_phone.replace(/\D/g,'')}`, '_blank');
          }}
          className="flex items-center gap-1 rounded bg-[#25D366]/10 px-2 py-1 text-[10px] font-bold text-[#1b9a4a] transition-colors hover:bg-[#25D366]/20"
        >
          <MessageCircle className="size-3" /> Chat
        </button>
        {onMoveNext && nextActionLabel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveNext();
            }}
            disabled={disabled}
            className="flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-600 transition-colors hover:bg-indigo-100 disabled:opacity-50"
          >
            {nextActionLabel} &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
