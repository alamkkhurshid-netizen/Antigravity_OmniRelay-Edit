"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageSquare, Flame } from "lucide-react";

type WhatsAppCounterProps = {
  organizationId: string;
  initialCounts: {
    messages: number;
    estimatedCostPaise: number;
  };
};

export function WhatsAppLiveCounter({ organizationId, initialCounts }: WhatsAppCounterProps) {
  const [messagesCount, setMessagesCount] = useState(initialCounts.messages);
  const [costPaise, setCostPaise] = useState(initialCounts.estimatedCostPaise);
  const supabase = createClient();
  const [justUpdated, setJustUpdated] = useState(false);

  useEffect(() => {
    // Subscribe to realtime inserts on operational_usage_events for this organization
    const channel = supabase
      .channel("whatsapp-live-usage")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "operational_usage_events",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const newEvent = payload.new;
          if (newEvent.channel === "whatsapp") {
            setMessagesCount((prev) => prev + 1);
            setCostPaise((prev) => prev + (newEvent.estimated_total_paise || 0));
            
            // Trigger the animation
            setJustUpdated(true);
            setTimeout(() => setJustUpdated(false), 1000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, supabase]);

  const costRupees = useMemo(() => (costPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [costPaise]);

  return (
    <div className={`relative flex items-center gap-4 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur-md shadow-sm transition-all duration-300 ${justUpdated ? "scale-[1.02] bg-white/20 shadow-md ring-1 ring-[#1bc5a8]/50" : ""}`}>
      {/* Live Indicator */}
      <div className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500"></span>
      </div>

      <div className="flex flex-col border-r border-white/15 pr-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">
          <MessageSquare className="size-3.5 text-[#4edcc7]" />
          <span>Live WhatsApp</span>
        </div>
        <div className="mt-0.5 flex items-baseline gap-1">
          <b className="text-xl font-extrabold tracking-tight text-white">{messagesCount}</b>
          <span className="text-[10px] text-slate-300">msgs today</span>
        </div>
      </div>

      <div className="flex flex-col pl-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">
          <Flame className="size-3.5 text-amber-400" />
          <span>Est. Cost</span>
        </div>
        <div className="mt-0.5 flex items-baseline gap-1 text-white">
          <b className="text-xl font-extrabold tracking-tight">₹{costRupees}</b>
        </div>
      </div>
    </div>
  );
}
