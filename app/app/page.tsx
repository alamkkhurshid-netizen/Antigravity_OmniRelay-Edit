import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, CircleAlert, MapPin, MessageCircleMore, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";

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
  const [{ data: entitlements }, { count: locationCount }, { count: serviceCount }, { data: profile }] = await Promise.all([
    supabase
      .from("entitlements")
      .select("plan_id,status,trial_ends_at,conversations_quota")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("business_locations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id),
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
  const profileReady = Boolean(profile?.primary_phone && profile?.email);
  const setupSteps = [
    ["Business profile", "Add a business phone and email so customers can reach you.", "/app/settings", profileReady],
    ["Add a location", "Set up the chamber, address and location contact details.", "/app/settings", (locationCount ?? 0) > 0],
    ["Add bookable services", "Tell customers what they can book and how long each service takes.", "/app/settings", (serviceCount ?? 0) > 0],
    ["Connect WhatsApp", "Connect when your Meta approval and business number are ready.", "/app/integrations", false],
  ] as const;
  const completedSteps = setupSteps.filter(([, , , complete]) => complete).length;

  return (
    <div className="grid gap-4 pb-10 xl:grid-cols-4">
      <section className="xl:col-span-4 flex flex-col gap-6 overflow-hidden rounded-[1.4rem] bg-[radial-gradient(circle_at_82%_10%,#5cc0dc_0,#2584b139_18%,transparent_42%),linear-gradient(115deg,#071a31,#0e3a60)] px-7 py-8 text-white shadow-[0_20px_45px_#0a345823] sm:flex-row sm:items-center sm:justify-between sm:px-9">
        <div><span className="or-type-label text-[#4edcc7]">TODAY&apos;S CLINIC PULSE</span><h2 className="or-type-page mt-2">Keep every patient journey moving.</h2><p className="mt-2 text-base text-[#b7d0e2]">{organization.name} · {businessCategory} · {locationCount ?? 0} locations</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className="inline-flex w-fit items-center gap-2 rounded-xl bg-white/20 px-4 py-3 text-sm font-bold text-white hover:bg-white/30 backdrop-blur-sm border border-white/20 transition-all" href="/app/analytics">
            <Sparkles className="size-4 text-[#4edcc7]" />Deep Analytics & AI Insights →
          </Link>
          <Link className="inline-flex w-fit items-center gap-2 rounded-xl bg-[linear-gradient(120deg,#56e6c7,#5aa1ff)] px-4 py-3 text-sm font-black text-[#05324b]" href="/app/appointments">
            <CalendarDays className="size-4" />New appointment
          </Link>
        </div>
      </section>
      {[
        ["Appointments", "0", "Connect WhatsApp to begin", CalendarDays, "text-[#173047]"],
        ["Locations", String(locationCount ?? 0), "Ready for availability rules", MapPin, "text-[#173047]"],
        ["Needs staff attention", "0", "No unresolved action", CircleAlert, "text-[#cf5a60]"],
        ["WhatsApp delivery", "—", "Connect a channel to monitor delivery", ShieldCheck, "text-[#173047]"],
      ].map(([label, value, detail, Icon, valueClass]) => <StatCard className="before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[linear-gradient(90deg,#54dfc7,#4b9af6)]" key={label as string} label={label as string} value={value as string} detail={detail as string} icon={<Icon className="size-5 text-[#1781bc]"/>} valueClassName={valueClass as string}/>) }
      <section className="xl:col-span-3 overflow-hidden rounded-[1.1rem] border border-[#e0e8ef] bg-white shadow-[0_10px_24px_#14496a0d]"><header className="flex items-center justify-between border-b border-[#e9eef3] px-6 py-5"><div><span className="text-xs font-black tracking-[.13em] text-[#4abfae]">OPERATIONS CALENDAR</span><h3 className="mt-1 text-xl font-semibold tracking-[-.03em]">Your next best steps</h3></div><span className="rounded-full bg-[#edf8f5] px-3 py-1.5 text-xs font-black text-[#177b73]">{completedSteps} / 4 ready</span></header>
        <div className="divide-y divide-[#edf1f4] px-6">{setupSteps.map(([title, detail, href, complete], index) => <Link className="group flex items-center gap-4 py-4" href={href} key={title}><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${complete ? "bg-[#e7f8ee] text-[#148261]" : "bg-[#eef7fb] text-[#177bb5]"}`}>{complete ? <CheckCircle2 className="size-4" /> : index + 1}</span><span className="min-w-0 flex-1"><b className="block text-sm text-[#173047]">{title}</b><small className="mt-1 block text-sm leading-5 text-[#718599]">{detail}</small></span><span className={`rounded-full px-2.5 py-1 text-xs font-black ${complete ? "bg-[#e7f8ee] text-[#148261]" : "bg-[#f1f6f8] text-[#60798c]"}`}>{complete ? "Complete" : title === "Connect WhatsApp" ? "When ready" : "Set up"}</span><ArrowRight className="size-4 text-[#8aa0ae] transition-transform group-hover:translate-x-1" /></Link>)}</div>
      </section>
      <section className="rounded-[1.1rem] border border-[#d9e9e8] bg-[linear-gradient(145deg,#f8fffd,#edf6ff)] p-6 shadow-[0_10px_24px_#14496a0d]"><span className="text-xs font-black tracking-[.13em] text-[#4abfae]">MULTI-DOCTOR OPERATIONS</span><h3 className="mt-2 text-xl font-semibold tracking-[-.03em]">Start with an appointment concierge</h3><p className="mt-3 text-sm leading-6 text-[#60788c]">Collect service, location and preferred time in WhatsApp, then confirm and remind automatically.</p><Link className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#177b73]" href="/app/automations">Explore workflow <ArrowRight className="size-4" /></Link></section>
      <section className="xl:col-span-4 grid gap-4 rounded-[1.1rem] border border-[#e0e8ef] bg-white p-6 shadow-[0_10px_24px_#14496a0d] md:grid-cols-3"><div><span className="text-xs font-black tracking-[.13em] text-[#4abfae]">SYSTEM HEALTH</span><h3 className="mt-2 text-xl font-semibold tracking-[-.03em]">Ready for clinic operations</h3><p className="mt-2 text-sm leading-5 text-[#718599]">Keep workflows, service setup, and delivery readiness visible in one place.</p></div><div className="rounded-xl bg-[#f6fbfc] p-4"><span className="text-sm text-[#718599]">Bookable services</span><b className="mt-2 block text-2xl tracking-[-.05em]">{serviceCount ?? 0}</b><small className="mt-1 block text-sm text-[#148261]">Configured for booking</small></div><div className="rounded-xl bg-[#f6fbfc] p-4"><span className="text-sm text-[#718599]">Workspace plan</span><b className="mt-2 block text-xl tracking-[-.04em] capitalize">{entitlements?.status ?? "Pending"}</b><small className="mt-1 block text-sm text-[#718599]">{entitlements?.plan_id ?? "launch"} · ends {trialEndsLabel}</small></div></section>
    </div>
  );
}
