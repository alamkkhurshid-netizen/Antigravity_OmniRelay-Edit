"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, BookOpenCheck, Bot, Building2, CalendarClock, CalendarDays, ChevronDown, ChevronRight, CircleAlert, ClipboardList, ContactRound, CreditCard, HeartPulse, House, LineChart, Megaphone, Menu, MessagesSquare, Package, PlugZap, Radar, Search, Settings2, ShieldCheck, ShoppingBag, Sparkles, Store, Target, TrendingUp, Users, UsersRound, Workflow, X } from "lucide-react";
import { Brand } from "./brand";
import { createClient } from "@/lib/supabase/client";
import { PwaRegistration } from "./pwa-registration";
import { OmniRelayGuide } from "./omni-relay-guide";
import { ProductTour } from "./product-tour";
import { WhatsAppCostCalculator } from "./whatsapp-cost-calculator";

type NavItem = readonly [label: string, href: string, icon: React.ComponentType<{ size?: number; strokeWidth?: number }>];

const navGroups: ReadonlyArray<{ label: string; items: readonly NavItem[] }> = [
  { label: "Workspace", items: [["Overview", "/app", House], ["Analytics & Insights", "/app/analytics", LineChart], ["Action centre", "/app/action-centre", CircleAlert]] },
  { label: "Patient care", items: [["Conversations", "/app/conversations", MessagesSquare], ["Contacts", "/app/contacts", ContactRound], ["Care plans", "/app/care-plans", HeartPulse], ["Appointments", "/app/appointments", CalendarDays], ["Clinic operations", "/app/clinic-operations", Building2], ["Booking concierge", "/app/booking-concierge", CalendarClock]] },
  { label: "Automation & engagement", items: [["Care reminders", "/app/automations", BellRing], ["Campaigns", "/app/campaigns", Megaphone], ["Integrations", "/app/integrations", PlugZap], ["AI agents", "/app/agents", Bot]] },
  { label: "Administration", items: [["Team operations", "/app/team", UsersRound], ["Operations", "/app/operations", ShieldCheck], ["Go-live readiness", "/app/readiness", BookOpenCheck], ["Activity logs", "/app/activity", ClipboardList], ["Business setup", "/app/settings", Settings2], ["Plans & billing", "/app/billing", CreditCard]] },
];

const retailNavGroups: ReadonlyArray<{ label: string; items: readonly NavItem[] }> = [
  { 
    label: "Store Operations", 
    items: [
      ["Store Hub", "/app/retail", Store],
      ["Order Pipeline", "/app/retail/orders", Package],
      ["Digital Catalog", "/app/retail/catalog", ShoppingBag],
      ["Revenue Analytics", "/app/retail/analytics", TrendingUp],
    ] 
  },
  { 
    label: "Customers & Chat", 
    items: [
      ["Customer CRM", "/app/retail/customers", Users],
      ["Live Conversations", "/app/conversations", MessagesSquare],
    ] 
  },
  { 
    label: "WhatsApp Automation", 
    items: [
      ["Flow Builder", "/app/retail/flows", Workflow],
      ["Broadcast Campaigns", "/app/retail/broadcasts", Megaphone],
      ["Commerce AI Agents", "/app/agents", Bot],
    ] 
  },
  { 
    label: "Marketing & Growth", 
    items: [
      ["Meta Ads Autopilot", "/app/retail/marketing", Target],
      ["Creative Engine", "/app/retail/creative", Sparkles],
      ["Content Calendar", "/app/retail/calendar", CalendarDays],
      ["Trend Radar", "/app/retail/trends", Radar],
    ] 
  },
  { 
    label: "Store Settings", 
    items: [
      ["Business Setup", "/app/settings", Settings2],
      ["Integrations", "/app/integrations", PlugZap],
      ["Plans & Billing", "/app/billing", CreditCard],
      ["Team Operations", "/app/team", UsersRound],
    ] 
  },
];

const titles: Record<string, string> = {
  "/app": "Overview",
  "/app/analytics": "Analytics & Insights",
  "/app/action-centre": "Action centre",
  "/app/conversations": "Conversations",
  "/app/contacts": "Contacts",
  "/app/care-plans": "Care plans",
  "/app/team": "Team operations",
  "/app/appointments": "Appointments",
  "/app/clinic-operations": "Clinic operations",
  "/app/booking-concierge": "WhatsApp booking concierge",
  "/app/agents": "AI agents",
  "/app/automations": "Medication & follow-up reminders",
  "/app/campaigns": "Campaigns",
  "/app/operations": "Operations centre",
  "/app/readiness": "Clinic go-live readiness",
  "/app/integrations": "Integrations",
  "/app/activity": "Activity logs",
  "/app/settings": "Business setup",
  "/app/billing": "Plans & billing",
  "/app/retail": "Store Hub",
  "/app/retail/orders": "Order Pipeline",
  "/app/retail/catalog": "Digital Catalog",
  "/app/retail/analytics": "Revenue Analytics",
  "/app/retail/customers": "Customer CRM",
  "/app/retail/flows": "Flow Builder",
  "/app/retail/broadcasts": "Broadcast Campaigns",
  "/app/retail/marketing": "Meta Ads Autopilot",
  "/app/retail/creative": "Creative Velocity Engine",
  "/app/retail/calendar": "Content Calendar",
  "/app/retail/trends": "Trend Radar",
};

function urlBase64ToBytes(value: string) {
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - value.length % 4) % 4)}`;
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

type NotificationItem = { id:string; title:string; body:string|null; href:string|null; priority:string; escalation_level:number; created_at:string };
type WhatsAppRate = { message_category:string; base_rate_paise:number|string; platform_fee_paise:number|string; source_version:string; verification_status?:"draft"|"verified" };
const notificationHref = (href:string|null) => href === "/app/action-centre" ? "/app/action-centre#priority-review-queue" : href ?? "/app/team";
const notificationTime = (value:string) => new Intl.DateTimeFormat("en-IN", { day:"numeric", month:"short", hour:"numeric", minute:"2-digit", timeZone:"Asia/Kolkata" }).format(new Date(value));

export function AppShell({
  children,
  email,
  isOperator,
  businessCategory,
  unreadNotifications,
  criticalNotifications,
  recentNotifications,
  whatsappRates,
}: {
  children: React.ReactNode;
  email: string;
  isOperator: boolean;
  businessCategory?: string;
  unreadNotifications: number;
  criticalNotifications: NotificationItem[];
  recentNotifications: NotificationItem[];
  whatsappRates: WhatsAppRate[];
}) {
  const pathname = usePathname();
  const title = titles[pathname] ?? "Workspace";
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [unread, setUnread] = useState(unreadNotifications);
  const [critical, setCritical] = useState(criticalNotifications);
  const [notifications, setNotifications] = useState(recentNotifications);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [browserAlertState, setBrowserAlertState] = useState<NotificationPermission | "unsupported">("unsupported");
  const [pushDeliveryReady, setPushDeliveryReady] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [dismissedCriticalId, setDismissedCriticalId] = useState<string | null>(() => typeof window === "undefined" ? null : window.localStorage.getItem("omnirelay-dismissed-critical-action"));
  const knownCriticalIds = useRef(new Set(criticalNotifications.map((item) => item.id)));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileNavOpen(false);
    setNotificationsOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (mobileNavOpen) document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileNavOpen(false);
      setNotificationsOpen(false);
      setAccountOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const permissionTimer = "Notification" in window
      ? window.setTimeout(() => setBrowserAlertState(Notification.permission), 0)
      : undefined;

    if (!("serviceWorker" in navigator)) {
      return () => {
        if (permissionTimer !== undefined) window.clearTimeout(permissionTimer);
      };
    }

    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setPushDeliveryReady(Boolean(subscription)))
      .catch(() => setPushDeliveryReady(false));

    return () => {
      if (permissionTimer !== undefined) window.clearTimeout(permissionTimer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const response = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
      if (!response?.ok || !active) return;
      const payload = await response.json() as {unread:number;critical:NotificationItem[];notifications:NotificationItem[]};
      setUnread(payload.unread);
      setCritical(payload.critical);
      setNotifications(payload.notifications);
      for (const item of payload.critical) {
        const isNew = !knownCriticalIds.current.has(item.id);
        knownCriticalIds.current.add(item.id);
        if (!isNew || pushDeliveryReady || !("Notification" in window) || Notification.permission !== "granted") continue;
        const alert = new Notification(`OmniRelay: ${item.title}`, {
          body: item.body ?? "A clinic action requires review in OmniRelay.",
          tag: `omnirelay-serious-action-${item.id}`,
          renotify: true,
        });
        alert.onclick = () => {
          window.focus();
          window.location.assign(notificationHref(item.href));
          alert.close();
        };
      }
    };
    const timer = window.setInterval(refresh, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [pushDeliveryReady]);

  function dismissCritical(id: string) {
    window.localStorage.setItem("omnirelay-dismissed-critical-action", id);
    setDismissedCriticalId(id);
  }

  async function enableBrowserAlerts() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setBrowserAlertState(permission);
    if (permission !== "granted" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("device-push-config");
    const publicKey = !error && typeof data?.publicKey === "string" ? data.publicKey : null;
    if (!publicKey) return;
    const bytes = urlBase64ToBytes(publicKey);
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    const response = await fetch("/api/push-subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
    if (!response.ok) await subscription.unsubscribe();
    else setPushDeliveryReady(true);
  }

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/login");
  }
  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_75%_-10%,#e4f8ff_0,transparent_27%),#f5f7fb] text-[#173047]">
      <PwaRegistration />
      {mobileNavOpen && <button type="button" className="fixed inset-0 z-40 bg-[#071426]/45 backdrop-blur-[2px] lg:hidden" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside id="workspace-navigation" className={`group fixed inset-y-0 left-0 z-50 flex h-dvh w-72 shrink-0 flex-col overflow-y-auto border-r border-[#dfded7] bg-[linear-gradient(135deg,#fffefd_0%,#f3f2ee_48%,#fbfaf7_100%)] px-4 py-5 shadow-[10px_0_32px_rgba(35,47,58,.12)] transition-transform duration-200 lg:sticky lg:top-0 lg:z-40 lg:h-screen lg:w-20 lg:px-3 lg:shadow-[10px_0_32px_rgba(35,47,58,.05)] lg:transition-[width,padding] lg:hover:w-72 lg:hover:px-4 lg:focus-within:w-72 lg:focus-within:px-4 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`} aria-label="Workspace navigation">
        <div className="mb-4 flex justify-end lg:hidden"><button type="button" className="grid size-11 place-items-center rounded-xl border border-[#d7e3ec] bg-white text-[#30516b]" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X className="size-5" /></button></div>
        <div className="mb-6 flex items-center justify-center group-hover:justify-start group-focus-within:justify-start">
          <Brand compact className="group-hover:hidden group-focus-within:hidden max-lg:hidden" />
          <Brand className="hidden h-11 w-44 group-hover:flex group-focus-within:flex max-lg:flex" />
        </div>
        <div className="flex items-center justify-center rounded-2xl border border-[#deddd6] bg-white/70 p-2.5 shadow-[0_7px_18px_rgba(35,46,52,.05)] group-hover:justify-start group-focus-within:justify-start max-lg:justify-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,#d9f5ee,#bfe3fa)]"><img className="size-full object-contain p-1" src="/omnirelay-mark.png" alt="" /></span>
          <b className="hidden min-w-0 flex-1 flex-col pl-2 text-sm text-[#213548] group-hover:flex group-focus-within:flex max-lg:flex">OmniRelay Workspace<small className="mt-0.5 text-xs font-medium text-[#77848b]">{(businessCategory === "Retail & e-commerce" || pathname.startsWith("/app/retail")) ? "Retail store" : "Trial workspace"}</small></b>
          <ChevronDown className="hidden size-4 text-[#77848b] group-hover:block group-focus-within:block max-lg:block" aria-hidden="true" />
        </div>
        <nav className="mt-5 flex flex-col gap-2" aria-label="Workspace navigation">
          {((businessCategory === "Retail & e-commerce" || pathname.startsWith("/app/retail")) ? retailNavGroups : navGroups).map((group) => {
            const containsCurrent = group.items.some(([, href]) => href === pathname);
            const open = containsCurrent || !collapsedGroups[group.label];
            return <section className="flex flex-col gap-1" key={group.label}>
              <button type="button" className="flex min-h-11 items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-black uppercase tracking-[.1em] text-[#73746f] hover:text-[#177b73] lg:hidden lg:group-hover:flex lg:group-focus-within:flex" aria-expanded={open} onClick={() => setCollapsedGroups((current) => ({ ...current, [group.label]: !open }))}>{group.label}{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</button>
              {open && group.items.map(([label, href, Icon]) => {
                const active = pathname === href;
                return <Link data-tour={href === "/app" ? "overview" : href === "/app/action-centre" ? "action-centre" : href === "/app/conversations" ? "conversations" : href === "/app/appointments" ? "appointments" : undefined} className={`relative flex min-h-11 items-center justify-start gap-3 rounded-xl border px-3 text-sm font-bold transition-colors lg:justify-center lg:gap-0 lg:px-0 lg:group-hover:justify-start lg:group-hover:gap-3 lg:group-hover:px-3 lg:group-focus-within:justify-start lg:group-focus-within:gap-3 lg:group-focus-within:px-3 ${active ? "border-[#d7e5e7] bg-[linear-gradient(90deg,#dff4f0,#e7effa)] text-[#163d59] shadow-[inset_3px_0_#23b8a4]" : "border-transparent text-[#53616a] hover:border-[#d7e5e7] hover:bg-[#f4fbfa] hover:text-[#163d59]"}`} href={href} key={label} title={label}><Icon className="size-[1.1rem] shrink-0" strokeWidth={1.9}/><span className="inline lg:hidden lg:group-hover:inline lg:group-focus-within:inline">{label}</span>{href === "/app/action-centre" && critical.length > 0 && <em className="ml-auto grid min-w-5 place-items-center rounded-full bg-[#d74747] px-1.5 py-0.5 text-xs not-italic text-white lg:absolute lg:right-1.5 lg:top-1.5 lg:group-hover:static lg:group-hover:ml-auto lg:group-focus-within:static lg:group-focus-within:ml-auto">{Math.min(critical.length, 99)}</em>}{href === "/app/team" && unread > 0 && <em className="ml-auto grid min-w-5 place-items-center rounded-full bg-[#0d8fd0] px-1.5 py-0.5 text-xs not-italic text-white lg:absolute lg:right-1.5 lg:top-1.5 lg:group-hover:static lg:group-hover:ml-auto lg:group-focus-within:static lg:group-focus-within:ml-auto">{Math.min(unread, 99)}</em>}</Link>;
              })}
            </section>;
          })}
        </nav>
        <div className="mt-auto hidden flex-col rounded-2xl border border-[#dfded6] bg-white/65 p-4 shadow-[0_7px_16px_rgba(35,46,52,.04)] group-hover:flex group-focus-within:flex max-lg:flex"><b className="text-sm text-[#177b73]">7 days to explore</b><span className="my-2 text-sm leading-5 text-[#707d83]">Connect a channel and launch your first workflow.</span><Link className="text-sm font-black text-[#177b73]" href="/app/billing">View plans →</Link></div>
        {isOperator && <Link className="mt-3 hidden px-2 text-sm font-black text-[#177b73] group-hover:block group-focus-within:block max-lg:block" href="/oem">OEM operator panel</Link>}
      </aside>
      <main className="app-main min-w-0 flex-1 px-4 pb-24 sm:px-6 lg:px-10 lg:pb-12">
        <header className="flex min-h-20 items-center justify-between gap-3 sm:min-h-24">
          <div className="flex min-w-0 items-center gap-3"><button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#d7e3ec] bg-white text-[#30516b] shadow-[0_8px_20px_#0d4d7d0d] lg:hidden" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}><Menu className="size-5" /></button><div className="min-w-0"><small className="or-type-label text-[#407c9d]">WORKSPACE</small><h1 className="or-type-section mt-1 truncate text-[#173047]">{title}</h1></div></div>
          <div className="flex items-center gap-2">
            {browserAlertState === "default" && <button className="hidden min-h-11 rounded-xl border border-[#d7e3ec] bg-white px-3 py-2 text-sm font-bold text-[#163d59] shadow-[0_8px_20px_#0d4d7d0d] md:block" onClick={enableBrowserAlerts}>Enable alerts</button>}
            {browserAlertState === "denied" && <span className="hidden text-sm text-[#8b3b3b] md:inline" title="Allow notifications for this site in your browser settings.">Alerts off</span>}
            <WhatsAppCostCalculator rates={whatsappRates} variant="header" />
            <button className="hidden min-h-11 rounded-xl border border-[#d7e3ec] bg-white px-3 py-2 text-sm font-bold text-[#163d59] shadow-[0_8px_20px_#0d4d7d0d] sm:block" type="button" onClick={() => window.dispatchEvent(new Event("omnirelay:start-tour"))}>Take a tour</button>
            <Link className="grid size-11 place-items-center rounded-xl border border-[#d7e3ec] bg-white text-[#30516b] shadow-[0_8px_20px_#0d4d7d0d]" aria-label="Search contacts" href="/app/contacts"><Search className="size-[1.1rem]" /></Link>
            <div className="relative"><button type="button" className={`relative grid size-11 place-items-center rounded-xl border bg-white text-[#30516b] shadow-[0_8px_20px_#0d4d7d0d] ${critical.length ? "border-[#e66464] bg-[#fff2f2] text-[#a72e2e]" : "border-[#d7e3ec]"}`} aria-label={`${unread} unread notifications`} aria-expanded={notificationsOpen} aria-haspopup="dialog" onClick={() => setNotificationsOpen((open) => !open)}><Bell className="size-[1.1rem]" />{unread > 0 && <i className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#ef5252] px-1.5 py-0.5 text-xs not-italic text-white">{Math.min(unread, 99)}</i>}</button>{notificationsOpen&&<section className="fixed inset-x-4 top-20 z-50 overflow-hidden rounded-2xl border border-[#d7e3ec] bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96" role="dialog" aria-label="Notifications"><header className="flex min-h-14 items-center justify-between border-b border-[#e8eef2] px-4 py-3"><div><b className="block text-base text-[#173047]">Notifications</b><span className="text-sm text-[#718397]">{unread ? `${unread} unread update${unread===1?"":"s"}` : "You are up to date"}</span></div><Link className="min-h-11 rounded-lg px-2 py-3 text-sm font-black text-[#177b73]" href="/app/team" onClick={() => setNotificationsOpen(false)}>View all</Link></header>{notifications.length?<div className="max-h-[min(28rem,calc(100vh-8rem))] overflow-y-auto">{notifications.map((item) => <Link key={item.id} href={notificationHref(item.href)} onClick={() => setNotificationsOpen(false)} className="group flex min-h-20 gap-3 border-b border-[#eef2f5] px-4 py-3 last:border-b-0 hover:bg-[#f4fbfa]"><span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl text-sm font-black ${item.priority==="urgent"?"bg-rose-100 text-rose-700":"bg-sky-100 text-sky-700"}`}>{item.priority==="urgent"?"!":"i"}</span><span className="min-w-0 flex-1"><b className="block text-sm leading-5 text-[#173047] group-hover:text-[#177b73]">{item.title}</b>{item.body&&<span className="mt-0.5 block text-sm leading-5 text-[#637481]">{item.body}</span>}<small className="mt-1 block text-xs font-medium text-[#84939c]">{notificationTime(item.created_at)} · {item.priority==="urgent"?"Needs action":"Update"}</small></span><span className="self-center text-sm font-black text-[#177b73]">Open</span></Link>)}</div>:<div className="px-4 py-8 text-center"><Bell className="mx-auto size-6 text-[#83a4b8]"/><b className="mt-2 block text-base text-[#173047]">No unread notifications</b><span className="mt-1 block text-sm text-[#718397]">New clinic updates will appear here.</span></div>}</section>}</div>
            <div className="relative"><button className="grid size-11 place-items-center rounded-xl bg-[linear-gradient(145deg,#1c789c,#243f9a)] text-sm font-black text-white shadow-[0_8px_20px_#0d4d7d0d]" aria-label="Open account menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(!accountOpen)}>{email.slice(0, 1).toUpperCase()}</button>{accountOpen && <div className="absolute right-0 top-12 z-50 flex w-60 flex-col gap-2 rounded-2xl border border-[#d7e3ec] bg-white p-4 text-sm shadow-2xl"><span className="text-[#718397]">Signed in as</span><b className="truncate text-[#173047]">{email}</b><Link className="mt-1 min-h-11 rounded-lg px-2 py-3 font-bold text-[#177b73] hover:bg-[#effaf8]" href="/app/settings" onClick={() => setAccountOpen(false)}>Business setup</Link><button className="min-h-11 rounded-lg px-2 py-3 text-left font-bold text-[#a72e2e] hover:bg-[#fff4f4] disabled:opacity-60" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button></div>}</div>
          </div>
        </header>
        {critical.length>0 && dismissedCriticalId !== critical[0].id && <section className="sticky top-2 z-30 mb-5 grid grid-cols-[2.4rem_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-2xl border border-[#efb2ac] bg-[linear-gradient(100deg,#fff8f6,#fff1ef)] p-4 shadow-[0_15px_32px_rgba(145,48,37,.12)] max-sm:grid-cols-[2.2rem_minmax(0,1fr)_auto]" role="alert" aria-live="assertive"><i className="grid size-9 place-items-center rounded-xl bg-[#d74747] text-lg font-black not-italic text-white">!</i><div className="flex min-w-0 flex-col gap-1"><small className="text-xs font-black tracking-[.12em] text-[#a72e2e]">ACTION NEEDS ATTENTION</small><b className="text-sm">{critical[0].title}</b><span className="truncate text-sm leading-5 text-[#6f4b4b] max-sm:whitespace-normal">{critical[0].body}</span>{critical.length>1&&<em className="text-xs font-black not-italic text-[#a72e2e]">+{critical.length-1} more unresolved action{critical.length>2?"s":""}</em>}</div><Link className="min-h-11 rounded-xl bg-[linear-gradient(120deg,#bd4847,#92343b)] px-4 py-3 text-sm font-black text-white max-sm:col-span-full max-sm:text-center" href={critical[0].href === "/app/action-centre" ? "/app/action-centre#priority-review-queue" : critical[0].href??"/app/action-centre"}>Review</Link><button type="button" className="grid size-11 place-items-center rounded-lg border border-[#e6a0a0] bg-white text-[#8b3b3b]" onClick={() => dismissCritical(critical[0].id)} aria-label="Dismiss this alert"><X className="size-4" /></button></section>}
        {children}
        <div data-tour="guide"><OmniRelayGuide /></div>
        <ProductTour />
      </main>
      {/* Mobile Bottom Navigation Bar: Thumb-reach ergonomics for phone screens */}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-[#dfded7] bg-white/95 px-1 py-1.5 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.06)] lg:hidden" aria-label="Mobile quick navigation">
        <Link href="/app" className={`flex min-h-[44px] min-w-[56px] flex-col items-center justify-center rounded-xl px-2 py-1 text-[11px] font-bold transition-colors ${pathname === "/app" ? "text-[#177b73]" : "text-[#5e6f7d] hover:text-[#177b73]"}`}>
          <House className="size-5" />
          <span className="mt-0.5">Overview</span>
        </Link>
        <Link href="/app/analytics" className={`flex min-h-[44px] min-w-[56px] flex-col items-center justify-center rounded-xl px-2 py-1 text-[11px] font-bold transition-colors ${pathname === "/app/analytics" ? "text-[#177b73]" : "text-[#5e6f7d] hover:text-[#177b73]"}`}>
          <LineChart className="size-5" />
          <span className="mt-0.5">Analytics</span>
        </Link>
        <Link href="/app/appointments" className={`flex min-h-[44px] min-w-[56px] flex-col items-center justify-center rounded-xl px-2 py-1 text-[11px] font-bold transition-colors ${pathname === "/app/appointments" ? "text-[#177b73]" : "text-[#5e6f7d] hover:text-[#177b73]"}`}>
          <CalendarDays className="size-5" />
          <span className="mt-0.5">Visits</span>
        </Link>
        <Link href="/app/action-centre" className={`relative flex min-h-[44px] min-w-[56px] flex-col items-center justify-center rounded-xl px-2 py-1 text-[11px] font-bold transition-colors ${pathname === "/app/action-centre" ? "text-[#177b73]" : "text-[#5e6f7d] hover:text-[#177b73]"}`}>
          <CircleAlert className="size-5" />
          <span className="mt-0.5">Alerts</span>
          {critical.length > 0 && <span className="absolute right-2 top-1.5 grid min-w-4 place-items-center rounded-full bg-[#d74747] px-1 text-[10px] font-bold text-white">{critical.length}</span>}
        </Link>
        <button type="button" onClick={() => setMobileNavOpen(true)} className="flex min-h-[44px] min-w-[56px] flex-col items-center justify-center rounded-xl px-2 py-1 text-[11px] font-bold text-[#5e6f7d] hover:text-[#177b73] transition-colors" aria-label="Open full workspace navigation">
          <Menu className="size-5" />
          <span className="mt-0.5">Menu</span>
        </button>
      </nav>
    </div>
  );
}
