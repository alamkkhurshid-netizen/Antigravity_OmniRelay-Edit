"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { OrderCard, RetailOrder } from "./order-card";
import { Loader2 } from "lucide-react";

const COLUMNS = [
  { id: "new", title: "New Orders", color: "bg-sky-100 text-sky-800 border-sky-200" },
  { id: "packing", title: "Packing", color: "bg-amber-100 text-amber-800 border-amber-200" },
  { id: "shipping", title: "Out for Delivery", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  { id: "completed", title: "Completed", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
] as const;

export function OrderBoard({ initialOrders, organizationId }: { initialOrders: RetailOrder[], organizationId: string }) {
  const [orders, setOrders] = useState<RetailOrder[]>(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setErrorMsg] = useState<string | null>(null);
  const supabase = createClient();

  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    e.dataTransfer.setData("orderId", orderId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const orderId = e.dataTransfer.getData("orderId");
    if (!orderId) return;

    const order = orders.find(o => o.id === orderId);
    if (!order || order.status === newStatus) return;

    // Optimistic update
    const previousOrders = [...orders];
    setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    setUpdatingId(orderId);

    // Persist to DB
    const { error } = await supabase
      .from("retail_orders")
      .update({ status: newStatus })
      .eq("id", orderId)
      .eq("organization_id", organizationId);

    if (error) {
      setErrorMsg("Failed to update order status.");
      setOrders(previousOrders); // Rollback
      setTimeout(() => setErrorMsg(null), 3000);
    }
    
    setUpdatingId(null);
  };

  const handleMove = async (orderId: string, currentStatus: string) => {
    const currentIndex = COLUMNS.findIndex(c => c.id === currentStatus);
    if (currentIndex === -1 || currentIndex === COLUMNS.length - 1) return;
    
    const newStatus = COLUMNS[currentIndex + 1].id;
    
    const previousOrders = [...orders];
    setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    setUpdatingId(orderId);

    const { error } = await supabase
      .from("retail_orders")
      .update({ status: newStatus })
      .eq("id", orderId)
      .eq("organization_id", organizationId);

    if (error) {
      setErrorMsg("Failed to update order status.");
      setOrders(previousOrders);
      setTimeout(() => setErrorMsg(null), 3000);
    }
    
    setUpdatingId(null);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {error && (
        <div className="rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 mx-1">
          {error}
        </div>
      )}
      <div className="flex h-full min-w-max gap-4 px-1 pb-4">
      {COLUMNS.map(column => (
        <div 
          key={column.id} 
          className="flex h-full w-[340px] flex-col rounded-2xl bg-slate-50/50 p-3 ring-1 ring-slate-200"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, column.id)}
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-700">{column.title}</h2>
            <span className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-bold ${column.color}`}>
              {orders.filter(o => o.status === column.id).length}
            </span>
          </div>

          <div className="flex min-h-[150px] flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden rounded-xl p-1">
            {orders.filter(o => o.status === column.id).map(order => (
              <div 
                key={order.id}
                draggable
                onDragStart={(e) => handleDragStart(e, order.id)}
                className={`cursor-grab active:cursor-grabbing ${updatingId === order.id ? "opacity-50" : ""}`}
              >
                <OrderCard 
                  order={order} 
                  disabled={updatingId === order.id}
                  onMoveNext={
                    column.id !== COLUMNS[COLUMNS.length - 1].id 
                      ? () => handleMove(order.id, column.id) 
                      : undefined
                  }
                  nextActionLabel={
                    column.id !== COLUMNS[COLUMNS.length - 1].id 
                      ? `Move to ${COLUMNS[COLUMNS.findIndex(c => c.id === column.id) + 1].title}`
                      : undefined
                  }
                />
              </div>
            ))}
            
            {orders.filter(o => o.status === column.id).length === 0 && (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
                <span className="text-xs font-medium">Drop orders here</span>
              </div>
            )}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
