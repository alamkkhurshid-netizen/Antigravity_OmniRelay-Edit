"use client";

import Link from "next/link";
import { Bell, BellRing, Menu, Search, Sparkles } from "lucide-react";
import { WhatsAppCostCalculator } from "../whatsapp-cost-calculator";
import { NotificationItem, WhatsAppRate, notificationHref, notificationTime } from "./nav-config";

export interface TopBarProps {
  title: string;
  email: string;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  browserAlertState: NotificationPermission | "unsupported";
  enableBrowserAlerts: () => void;
  whatsappRates: WhatsAppRate[];
  unread: number;
  critical: NotificationItem[];
  notifications: NotificationItem[];
  notificationsOpen: boolean;
  setNotificationsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  accountOpen: boolean;
  setAccountOpen: React.Dispatch<React.SetStateAction<boolean>>;
  signOut: () => void;
  signingOut: boolean;
}

export function TopBar({
  title,
  email,
  mobileNavOpen,
  setMobileNavOpen,
  browserAlertState,
  enableBrowserAlerts,
  whatsappRates,
  unread,
  critical,
  notifications,
  notificationsOpen,
  setNotificationsOpen,
  accountOpen,
  setAccountOpen,
  signOut,
  signingOut,
}: TopBarProps) {
  return (
    <header className="flex min-h-20 items-center justify-between gap-3 sm:min-h-24">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#d7e3ec] bg-white text-[#30516b] shadow-[0_8px_20px_#0d4d7d0d] lg:hidden"
          aria-label="Open navigation"
          aria-controls="workspace-navigation"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu className="size-5" />
        </button>
        <div className="min-w-0">
          <small className="or-type-label text-[#407c9d]">WORKSPACE</small>
          <h1 className="or-type-section mt-1 truncate text-[#173047]">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {browserAlertState === "default" && (
          <button
            className="hidden min-h-11 items-center gap-2 rounded-xl border border-slate-200/60 bg-white/60 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm backdrop-blur-md transition-all hover:bg-white hover:shadow-md hover:ring-1 hover:ring-slate-200 md:flex cursor-pointer"
            onClick={enableBrowserAlerts}
          >
            <BellRing className="size-4 text-teal-600" />
            Enable alerts
          </button>
        )}
        {browserAlertState === "denied" && (
          <span
            className="hidden text-sm text-[#8b3b3b] md:inline"
            title="Allow notifications for this site in your browser settings."
          >
            Alerts off
          </span>
        )}

        <WhatsAppCostCalculator rates={whatsappRates} variant="header" />

        <button
          className="hidden min-h-11 items-center gap-2 rounded-xl border border-slate-200/60 bg-white/60 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm backdrop-blur-md transition-all hover:bg-white hover:shadow-md hover:ring-1 hover:ring-slate-200 sm:flex cursor-pointer"
          type="button"
          onClick={() => window.dispatchEvent(new Event("omnirelay:start-tour"))}
        >
          <Sparkles className="size-4 text-indigo-500" />
          Take a tour
        </button>

        <Link
          className="grid size-11 place-items-center rounded-xl border border-[#d7e3ec] bg-white text-[#30516b] shadow-[0_8px_20px_#0d4d7d0d]"
          aria-label="Search contacts"
          href="/app/contacts"
        >
          <Search className="size-[1.1rem]" />
        </Link>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            type="button"
            className={`relative grid size-11 place-items-center rounded-xl border bg-white text-[#30516b] shadow-[0_8px_20px_#0d4d7d0d] cursor-pointer ${
              critical.length
                ? "border-[#e66464] bg-[#fff2f2] text-[#a72e2e]"
                : "border-[#d7e3ec]"
            }`}
            aria-label={`${unread} unread notifications`}
            aria-expanded={notificationsOpen}
            aria-haspopup="dialog"
            onClick={() => setNotificationsOpen((open) => !open)}
          >
            <Bell className="size-[1.1rem]" />
            {unread > 0 && (
              <i className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#ef5252] px-1.5 py-0.5 text-xs not-italic text-white">
                {Math.min(unread, 99)}
              </i>
            )}
          </button>
          {notificationsOpen && (
            <section
              className="fixed inset-x-4 top-20 z-50 overflow-hidden rounded-2xl border border-[#d7e3ec] bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"
              role="dialog"
              aria-label="Notifications"
            >
              <header className="flex min-h-14 items-center justify-between border-b border-[#e8eef2] px-4 py-3">
                <div>
                  <b className="block text-base text-[#173047]">Notifications</b>
                  <span className="text-sm text-[#718397]">
                    {unread
                      ? `${unread} unread update${unread === 1 ? "" : "s"}`
                      : "You are up to date"}
                  </span>
                </div>
                <Link
                  className="min-h-11 rounded-lg px-2 py-3 text-sm font-black text-[#177b73]"
                  href="/app/team"
                  onClick={() => setNotificationsOpen(false)}
                >
                  View all
                </Link>
              </header>
              {notifications.length ? (
                <div className="max-h-[min(28rem,calc(100vh-8rem))] overflow-y-auto">
                  {notifications.map((item) => (
                    <Link
                      key={item.id}
                      href={notificationHref(item.href)}
                      onClick={() => setNotificationsOpen(false)}
                      className="group flex min-h-20 gap-3 border-b border-[#eef2f5] px-4 py-3 last:border-b-0 hover:bg-[#f4fbfa]"
                    >
                      <span
                        className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl text-sm font-black ${
                          item.priority === "urgent"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-sky-100 text-sky-700"
                        }`}
                      >
                        {item.priority === "urgent" ? "!" : "i"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block text-sm leading-5 text-[#173047] group-hover:text-[#177b73]">
                          {item.title}
                        </b>
                        {item.body && (
                          <span className="mt-0.5 block text-sm leading-5 text-[#637481]">
                            {item.body}
                          </span>
                        )}
                        <small className="mt-1 block text-xs font-medium text-[#84939c]">
                          {notificationTime(item.created_at)} ·{" "}
                          {item.priority === "urgent" ? "Needs action" : "Update"}
                        </small>
                      </span>
                      <span className="self-center text-sm font-black text-[#177b73]">Open</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-8 text-center">
                  <Bell className="mx-auto size-6 text-[#83a4b8]" />
                  <b className="mt-2 block text-base text-[#173047]">No unread notifications</b>
                  <span className="mt-1 block text-sm text-[#718397]">
                    New clinic updates will appear here.
                  </span>
                </div>
              )}
            </section>
          )}
        </div>

        {/* User Account Menu */}
        <div className="relative">
          <button
            className="grid size-11 place-items-center rounded-xl bg-[linear-gradient(145deg,#1c789c,#243f9a)] text-sm font-black text-white shadow-[0_8px_20px_#0d4d7d0d] cursor-pointer"
            aria-label="Open account menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen(!accountOpen)}
          >
            {email.slice(0, 1).toUpperCase()}
          </button>
          {accountOpen && (
            <div className="absolute right-0 top-12 z-50 flex w-60 flex-col gap-2 rounded-2xl border border-[#d7e3ec] bg-white p-4 text-sm shadow-2xl">
              <span className="text-[#718397]">Signed in as</span>
              <b className="truncate text-[#173047]">{email}</b>
              <Link
                className="mt-1 min-h-11 rounded-lg px-2 py-3 font-bold text-[#177b73] hover:bg-[#effaf8]"
                href="/app/settings"
                onClick={() => setAccountOpen(false)}
              >
                Business setup
              </Link>
              <button
                className="min-h-11 rounded-lg px-2 py-3 text-left font-bold text-[#a72e2e] hover:bg-[#fff4f4] disabled:opacity-60 cursor-pointer"
                onClick={signOut}
                disabled={signingOut}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
