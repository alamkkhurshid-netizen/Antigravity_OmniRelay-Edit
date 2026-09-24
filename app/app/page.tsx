import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, CheckCircle2, CircleAlert, MapPin, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id,name,created_at,extra")
    .order("created_at", { ascending: false })
    .limit(1);

  if (!organizations?.length) {
    return (
      <section className="empty-workspace">
        <span className="app-eyebrow">FIRST THINGS FIRST</span>
        <h2>Build your OmniRelay workspace</h2>
        <p>Tell us about your business. We’ll recommend channels, AI agents and n8n workflows that fit your category.</p>
        <Link className="primary-link" href="/onboarding">Start guided setup →</Link>
      </section>
    );
  }

  const organization = organizations[0];
  const [{ data: entitlements }, { count: locationCount }, { count: doctorCount }, { count: serviceCount }, { data: profile }] = await Promise.all([
    supabase
      .from("entitlements")
      .select("plan_id,status,trial_ends_at,conversations_quota")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("business_locations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id),
    supabase
      .from("booking_resources")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("resource_type", "doctor"),
    supabase.from("organization_services").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("booking_enabled", true),
    supabase.from("onboarding_profiles").select("primary_phone,email").eq("organization_id", organization.id).maybeSingle(),
  ]);

  const trialEndsLabel = entitlements?.trial_ends_at
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(entitlements.trial_ends_at))
    : "Not started";
  const businessCategory =
    (organization.extra as { business_category?: string } | null)
      ?.business_category ?? "Service business";

  if (businessCategory === "Retail & e-commerce") {
    redirect("/app/retail");
  }
  const profileReady = Boolean(profile?.primary_phone && profile?.email);
  const setupSteps = [
    ["Business profile", "Add a business phone and email so customers can reach you.", "/app/settings", profileReady],
    ["Add a location", "Set up the chamber, address and location contact details.", "/app/settings", (locationCount ?? 0) > 0],
    ["Add bookable services", "Tell customers what they can book and how long each service takes.", "/app/settings", (serviceCount ?? 0) > 0],
    ["Connect WhatsApp", "Connect when your Meta approval and business number are ready.", "/app/integrations", false],
  ] as const;
  const completedSteps = setupSteps.filter(([, , , complete]) => complete).length;

  return (
    <div className="grid gap-6 pb-12 xl:grid-cols-4 px-2">
      {/* 1. HERO SECTION */}
      <section className="relative xl:col-span-4 flex flex-col gap-6 overflow-hidden rounded-2xl bg-slate-950 px-6 py-6 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:px-6 isolate">
        {/* Ambient Orbs & Grain */}
        <div className="absolute -top-32 -right-32 h-[30rem] w-[30rem] rounded-full bg-teal-500/20 blur-[120px] -z-10 pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 h-[30rem] w-[30rem] rounded-full bg-blue-600/20 blur-[120px] -z-10 pointer-events-none" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none -z-10" />
        
        <div className="z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-teal-400 ring-1 ring-inset ring-teal-500/20 uppercase">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-500"></span>
            </span>
            TODAY&apos;S CLINIC PULSE
          </span>
          <h2 className="mt-4 text-2xl sm:text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-100 to-slate-400 leading-[1.15]">
            Keep every patient <br className="hidden sm:block" /> journey moving.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-400 font-medium tracking-wide flex items-center flex-wrap gap-2">
            <span className="text-slate-300">{organization.name}</span>
            <span className="text-slate-600">•</span>
            <span>{businessCategory}</span>
            <span className="text-slate-600">•</span>
            <span>{doctorCount ?? 0} doctors</span>
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 z-10">
          <Link className="group flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 px-4 py-3 text-[13px] font-semibold text-white backdrop-blur-md border border-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(255,255,255,0.05)]" href="/app/analytics">
            <Sparkles className="size-4 text-teal-400 group-hover:text-teal-300 transition-colors" />
            <span>Deep Analytics</span>
            <ArrowRight className="size-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </Link>
          <Link className="group flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-blue-500 hover:from-teal-300 hover:to-blue-400 px-4 py-3 text-[13px] font-bold text-slate-950 transition-all duration-300 hover:scale-[1.02] shadow-[0_0_20px_rgba(45,212,191,0.25)] hover:shadow-[0_0_30px_rgba(45,212,191,0.4)]" href="/app/appointments">
            <CalendarDays className="size-4" />
            <span>New appointment</span>
          </Link>
        </div>
      </section>

      {/* 2. STAT CARDS */}
      {/* 2. STAT CARDS */}
      <section className="xl:col-span-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Appointments", "0", "Connect WhatsApp to begin", CalendarDays, "text-slate-900", "bg-blue-50 text-blue-600", "/app/appointments"],
          ["Doctors", String(doctorCount ?? 0), "Ready for appointment booking", UsersRound, "text-slate-900", "bg-teal-50 text-teal-600", "/app/team"],
          ["Needs staff attention", "0", "No unresolved action", CircleAlert, "text-rose-600", "bg-rose-50 text-rose-600", "/app/action-centre"],
          ["WhatsApp delivery", "—", "Connect a channel to monitor delivery", ShieldCheck, "text-slate-900", "bg-indigo-50 text-indigo-600", "/app/integrations"],
        ].map(([label, value, detail, Icon, valueClass, iconBg, href]) => (
          <Link href={href as string} key={label as string} className="group relative overflow-hidden rounded-2xl bg-white p-5 shadow-[0_4px_20px_#05234206] border border-slate-100 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 hover:border-slate-300 block">
            <div className="absolute right-0 top-0 h-32 w-32 -translate-y-16 translate-x-16 rounded-full bg-slate-50 opacity-50 transition-transform duration-700 ease-out group-hover:scale-150" />
            <div className="relative flex items-center justify-between">
              <h3 className="text-[11px] font-bold text-slate-500 tracking-widest uppercase">{label}</h3>
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors duration-300 ${iconBg}`}>
                {/* @ts-ignore */}
                <Icon className="size-4.5" />
              </div>
            </div>
            <div className="relative mt-4">
              <span className={`text-2xl font-extrabold tracking-tight ${valueClass}`}>{value}</span>
            </div>
            <p className="relative mt-2 text-[13px] text-slate-400 font-medium">{detail}</p>
          </Link>
        ))}
      </section>

      {/* 3. OPERATIONS CALENDAR */}
      <section className="xl:col-span-3 overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_#05234206] border border-slate-100">
        <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-5">
          <div>
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Operations Calendar</span>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900">Your next best steps</h3>
          </div>
          <div className="flex items-center gap-3.5">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-teal-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${(completedSteps / 4) * 100}%` }} />
            </div>
            <span className="text-[13px] font-bold text-slate-500">{completedSteps} / 4</span>
          </div>
        </header>
        <div className="px-6 py-2 relative">
          {/* Vertical Timeline Line */}
          <div className="absolute left-[2.85rem] top-8 bottom-8 w-[2px] bg-slate-100 -z-10" />
          
          {setupSteps.map(([title, detail, href, complete], index) => (
            <Link className={`group flex items-start gap-5 py-5 transition-all duration-300 ${complete ? 'opacity-60 hover:opacity-100' : ''}`} href={href} key={title}>
              <div className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ring-[3px] ring-white transition-colors duration-300 ${complete ? "bg-teal-50 text-teal-600" : "bg-blue-600 text-white shadow-md shadow-blue-600/20"}`}>
                {complete ? <CheckCircle2 className="size-4" /> : <span className="font-bold text-[13px]">{index + 1}</span>}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <b className={`block text-[15px] font-bold ${complete ? 'text-slate-500' : 'text-slate-900'} transition-colors duration-300`}>{title}</b>
                <p className="mt-1 block text-[13px] font-medium leading-relaxed text-slate-500">{detail}</p>
              </div>
              <div className="flex items-center gap-2.5 pt-1">
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors duration-300 ${complete ? "bg-teal-50 text-teal-600" : "bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-700"}`}>
                  {complete ? "Completed" : title === "Connect WhatsApp" ? "When ready" : "Action required"}
                </span>
                <ArrowRight className={`size-3.5 transition-all duration-300 ${complete ? 'text-slate-300' : 'text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1'}`} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 4. MULTI-DOCTOR OPERATIONS */}
      <section className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-50 to-blue-50 p-6 shadow-sm border border-slate-200/60 transition-all duration-500 hover:shadow-md">
        <div className="absolute -right-12 -top-12 size-48 rounded-full bg-teal-200/40 blur-[40px] transition-transform duration-1000 ease-out group-hover:scale-150" />
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div>
            <span className="text-[10px] font-bold tracking-widest text-teal-600 uppercase">Multi-Doctor Ops</span>
            <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-900 leading-tight">Start with an appointment concierge</h3>
            <p className="mt-3 text-[13px] font-medium leading-relaxed text-slate-600">Collect service, location and preferred time in WhatsApp, then confirm and remind automatically.</p>
          </div>
          <Link className="mt-6 inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13px] font-bold text-slate-900 shadow-sm ring-1 ring-slate-200 transition-all duration-300 hover:bg-slate-50 hover:ring-slate-300 hover:shadow group-hover:translate-x-1" href="/app/automations">
            Explore workflow <ArrowRight className="size-3.5 text-slate-400" />
          </Link>
        </div>
      </section>

      {/* 5. SYSTEM HEALTH */}
      <section className="xl:col-span-4 grid gap-5 rounded-2xl bg-white p-6 shadow-[0_4px_20px_#05234206] border border-slate-100 md:grid-cols-3 items-center">
        <div className="pr-4">
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">System Health</span>
          <h3 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">Ready for operations</h3>
          <p className="mt-2 text-[13px] font-medium leading-relaxed text-slate-500">Keep workflows, service setup, and delivery readiness visible in one place.</p>
        </div>
        <div className="flex flex-col justify-center rounded-xl bg-slate-50/50 p-5 border border-slate-100 transition-colors duration-300 hover:bg-slate-50">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Bookable Services</span>
          <b className="mt-3 block text-2xl font-extrabold text-slate-900 tracking-tight">{serviceCount ?? 0}</b>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-500"></span>
            </span>
            <small className="text-[13px] font-bold text-teal-600">Configured for booking</small>
          </div>
        </div>
        <div className="flex flex-col justify-center rounded-xl bg-slate-50/50 p-5 border border-slate-100 transition-colors duration-300 hover:bg-slate-50">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Workspace Plan</span>
          <b className="mt-3 block text-2xl font-extrabold text-slate-900 tracking-tight capitalize">{entitlements?.status ?? "Pending"}</b>
          <div className="mt-2.5 flex items-center gap-2">
            <ShieldCheck className="size-4 text-indigo-500" />
            <small className="text-[13px] font-bold text-slate-600">{entitlements?.plan_id ?? "launch"} <span className="mx-1.5 text-slate-300">•</span> ends {trialEndsLabel}</small>
          </div>
        </div>
      </section>
    </div>
  );
}
