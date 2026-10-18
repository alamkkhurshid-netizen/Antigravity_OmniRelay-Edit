"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Brand } from "../brand";
import { NavGroup, NavItem } from "./nav-config";

export interface SidebarProps {
  pathname: string;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  groups: ReadonlyArray<NavGroup>;
  collapsedGroups: Record<string, boolean>;
  setCollapsedGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  businessCategory?: string;
  isOperator: boolean;
  criticalCount: number;
  unreadCount: number;
}

export function Sidebar({
  pathname,
  mobileNavOpen,
  setMobileNavOpen,
  groups,
  collapsedGroups,
  setCollapsedGroups,
  businessCategory,
  isOperator,
  criticalCount,
  unreadCount,
}: SidebarProps) {
  const isRetail = businessCategory === "Retail & e-commerce" || pathname.startsWith("/app/retail");

  return (
    <aside
      id="workspace-navigation"
      className={`group fixed inset-y-0 left-0 z-50 flex h-dvh w-72 shrink-0 flex-col overflow-y-auto border-r border-[#dfded7] bg-[linear-gradient(135deg,#fffefd_0%,#f3f2ee_48%,#fbfaf7_100%)] px-4 py-5 shadow-[10px_0_32px_rgba(35,47,58,.12)] transition-transform duration-200 lg:sticky lg:top-0 lg:z-40 lg:h-screen lg:w-20 lg:px-3 lg:shadow-[10px_0_32px_rgba(35,47,58,.05)] lg:transition-[width,padding] lg:hover:w-72 lg:hover:px-4 lg:focus-within:w-72 lg:focus-within:px-4 ${
        mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}
      aria-label="Workspace navigation"
    >
      <div className="mb-4 flex justify-end lg:hidden">
        <button
          type="button"
          className="grid size-11 place-items-center rounded-xl border border-[#d7e3ec] bg-white text-[#30516b]"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="mb-6 flex items-center justify-center group-hover:justify-start group-focus-within:justify-start">
        <Brand compact className="group-hover:hidden group-focus-within:hidden max-lg:hidden" />
        <Brand className="hidden h-11 w-44 group-hover:flex group-focus-within:flex max-lg:flex" />
      </div>

      <div className="flex items-center justify-center rounded-2xl border border-[#deddd6] bg-white/70 p-2.5 shadow-[0_7px_18px_rgba(35,46,52,.05)] group-hover:justify-start group-focus-within:justify-start max-lg:justify-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,#d9f5ee,#bfe3fa)]">
          <img className="size-full object-contain p-1" src="/omnirelay-mark.png" alt="" />
        </span>
        <b className="hidden min-w-0 flex-1 flex-col pl-2 text-sm text-[#213548] group-hover:flex group-focus-within:flex max-lg:flex">
          OmniRelay Workspace
          <small className="mt-0.5 text-xs font-medium text-[#77848b]">
            {isRetail ? "Retail store" : "Trial workspace"}
          </small>
        </b>
        <ChevronDown className="hidden size-4 text-[#77848b] group-hover:block group-focus-within:block max-lg:block" aria-hidden="true" />
      </div>

      <nav className="mt-5 flex flex-col gap-2" aria-label="Workspace navigation">
        {groups.map((group) => {
          const containsCurrent = group.items.some(([, href]) => href === pathname);
          const open = containsCurrent || !collapsedGroups[group.label];
          return (
            <section className="flex flex-col gap-1" key={group.label}>
              <button
                type="button"
                className="flex min-h-11 items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-black uppercase tracking-[.1em] text-[#73746f] hover:text-[#177b73] lg:hidden lg:group-hover:flex lg:group-focus-within:flex"
                aria-expanded={open}
                onClick={() => setCollapsedGroups((current) => ({ ...current, [group.label]: !open }))}
              >
                {group.label}
                {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </button>
              {open &&
                group.items.map(([label, href, Icon]: NavItem) => {
                  const active = pathname === href;
                  return (
                    <Link
                      data-tour={
                        href === "/app"
                          ? "overview"
                          : href === "/app/action-centre"
                          ? "action-centre"
                          : href === "/app/conversations"
                          ? "conversations"
                          : href === "/app/appointments"
                          ? "appointments"
                          : undefined
                      }
                      className={`relative flex min-h-11 items-center justify-start gap-3 rounded-xl border px-3 text-sm font-bold transition-colors lg:justify-center lg:gap-0 lg:px-0 lg:group-hover:justify-start lg:group-hover:gap-3 lg:group-hover:px-3 lg:group-focus-within:justify-start lg:group-focus-within:gap-3 lg:group-focus-within:px-3 ${
                        active
                          ? "border-[#d7e5e7] bg-[linear-gradient(90deg,#dff4f0,#e7effa)] text-[#163d59] shadow-[inset_3px_0_#23b8a4]"
                          : "border-transparent text-[#53616a] hover:border-[#d7e5e7] hover:bg-[#f4fbfa] hover:text-[#163d59]"
                      }`}
                      href={href}
                      key={label}
                      title={label}
                    >
                      <Icon className="size-[1.1rem] shrink-0" strokeWidth={1.9} />
                      <span className="inline lg:hidden lg:group-hover:inline lg:group-focus-within:inline">
                        {label}
                      </span>
                      {href === "/app/action-centre" && criticalCount > 0 && (
                        <em className="ml-auto grid min-w-5 place-items-center rounded-full bg-[#d74747] px-1.5 py-0.5 text-xs not-italic text-white lg:absolute lg:right-1.5 lg:top-1.5 lg:group-hover:static lg:group-hover:ml-auto lg:group-focus-within:static lg:group-focus-within:ml-auto">
                          {Math.min(criticalCount, 99)}
                        </em>
                      )}
                      {href === "/app/team" && unreadCount > 0 && (
                        <em className="ml-auto grid min-w-5 place-items-center rounded-full bg-[#0d8fd0] px-1.5 py-0.5 text-xs not-italic text-white lg:absolute lg:right-1.5 lg:top-1.5 lg:group-hover:static lg:group-hover:ml-auto lg:group-focus-within:static lg:group-focus-within:ml-auto">
                          {Math.min(unreadCount, 99)}
                        </em>
                      )}
                    </Link>
                  );
                })}
            </section>
          );
        })}
      </nav>

      <div className="mt-auto hidden flex-col rounded-2xl border border-[#dfded6] bg-white/65 p-4 shadow-[0_7px_16px_rgba(35,46,52,.04)] group-hover:flex group-focus-within:flex max-lg:flex">
        <b className="text-sm text-[#177b73]">7 days to explore</b>
        <span className="my-2 text-sm leading-5 text-[#707d83]">
          Connect a channel and launch your first workflow.
        </span>
        <Link className="text-sm font-black text-[#177b73]" href="/app/billing">
          View plans →
        </Link>
      </div>

      {isOperator && (
        <Link
          className="mt-3 hidden px-2 text-sm font-black text-[#177b73] group-hover:block group-focus-within:block max-lg:block"
          href="/oem"
        >
          OEM operator panel
        </Link>
      )}
    </aside>
  );
}
