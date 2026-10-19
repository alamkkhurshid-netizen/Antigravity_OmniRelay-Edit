"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { NotificationItem } from "./nav-config";

export interface CriticalBannerProps {
  critical: NotificationItem[];
  dismissedId: string | null;
  onDismiss: (id: string) => void;
}

export function CriticalBanner({ critical, dismissedId, onDismiss }: CriticalBannerProps) {
  if (critical.length === 0 || dismissedId === critical[0].id) {
    return null;
  }

  const first = critical[0];
  const targetHref =
    first.href === "/app/action-centre"
      ? "/app/action-centre#priority-review-queue"
      : first.href ?? "/app/action-centre";

  return (
    <section
      className="sticky top-2 z-30 mb-5 grid grid-cols-[2.4rem_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-2xl border border-[#efb2ac] bg-[linear-gradient(100deg,#fff8f6,#fff1ef)] p-4 shadow-[0_15px_32px_rgba(145,48,37,.12)] max-sm:grid-cols-[2.2rem_minmax(0,1fr)_auto]"
      role="alert"
      aria-live="assertive"
    >
      <i className="grid size-9 place-items-center rounded-xl bg-[#d74747] text-lg font-black not-italic text-white">
        !
      </i>
      <div className="flex min-w-0 flex-col gap-1">
        <small className="text-xs font-black tracking-[.12em] text-[#a72e2e]">
          ACTION NEEDS ATTENTION
        </small>
        <b className="text-sm">{first.title}</b>
        <span className="truncate text-sm leading-5 text-[#6f4b4b] max-sm:whitespace-normal">
          {first.body}
        </span>
        {critical.length > 1 && (
          <em className="text-xs font-black not-italic text-[#a72e2e]">
            +{critical.length - 1} more unresolved action{critical.length > 2 ? "s" : ""}
          </em>
        )}
      </div>
      <Link
        className="min-h-11 rounded-xl bg-[linear-gradient(120deg,#bd4847,#92343b)] px-4 py-3 text-sm font-black text-white max-sm:col-span-full max-sm:text-center"
        href={targetHref}
      >
        Review
      </Link>
      <button
        type="button"
        className="grid size-11 place-items-center rounded-lg border border-[#e6a0a0] bg-white text-[#8b3b3b] cursor-pointer"
        onClick={() => onDismiss(first.id)}
        aria-label="Dismiss this alert"
      >
        <X className="size-4" />
      </button>
    </section>
  );
}
