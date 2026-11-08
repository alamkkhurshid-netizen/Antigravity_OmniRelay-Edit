"use client";

import Link from "next/link";
import { CalendarDays, CircleAlert, House, LineChart, Menu } from "lucide-react";

export interface MobileNavProps {
  pathname: string;
  criticalCount: number;
  onOpenSidebar: () => void;
}

export function MobileNav({ pathname, criticalCount, onOpenSidebar }: MobileNavProps) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-[#dfded7] bg-white/95 px-1 py-1.5 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.06)] lg:hidden"
      aria-label="Mobile quick navigation"
    >
      <Link
        href="/app"
        className={`flex min-h-[44px] min-w-[56px] flex-col items-center justify-center rounded-xl px-2 py-1 text-[11px] font-bold transition-colors ${
          pathname === "/app" ? "text-[#177b73]" : "text-[#5e6f7d] hover:text-[#177b73]"
        }`}
      >
        <House className="size-5" />
        <span className="mt-0.5">Overview</span>
      </Link>
      <Link
        href="/app/analytics"
        className={`flex min-h-[44px] min-w-[56px] flex-col items-center justify-center rounded-xl px-2 py-1 text-[11px] font-bold transition-colors ${
          pathname === "/app/analytics" ? "text-[#177b73]" : "text-[#5e6f7d] hover:text-[#177b73]"
        }`}
      >
        <LineChart className="size-5" />
        <span className="mt-0.5">Analytics</span>
      </Link>
      <Link
        href="/app/appointments"
        className={`flex min-h-[44px] min-w-[56px] flex-col items-center justify-center rounded-xl px-2 py-1 text-[11px] font-bold transition-colors ${
          pathname === "/app/appointments" ? "text-[#177b73]" : "text-[#5e6f7d] hover:text-[#177b73]"
        }`}
      >
        <CalendarDays className="size-5" />
        <span className="mt-0.5">Visits</span>
      </Link>
      <Link
        href="/app/action-centre"
        className={`relative flex min-h-[44px] min-w-[56px] flex-col items-center justify-center rounded-xl px-2 py-1 text-[11px] font-bold transition-colors ${
          pathname === "/app/action-centre" ? "text-[#177b73]" : "text-[#5e6f7d] hover:text-[#177b73]"
        }`}
      >
        <CircleAlert className="size-5" />
        <span className="mt-0.5">Alerts</span>
        {criticalCount > 0 && (
          <span className="absolute right-2 top-1.5 grid min-w-4 place-items-center rounded-full bg-[#d74747] px-1 text-[10px] font-bold text-white">
            {criticalCount}
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={onOpenSidebar}
        className="flex min-h-[44px] min-w-[56px] flex-col items-center justify-center rounded-xl px-2 py-1 text-[11px] font-bold text-[#5e6f7d] hover:text-[#177b73] transition-colors cursor-pointer"
        aria-label="Open full workspace navigation"
      >
        <Menu className="size-5" />
        <span className="mt-0.5">Menu</span>
      </button>
    </nav>
  );
}
