import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UsersRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceHero } from "@/components/workspace-hero";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id,name,created_at,extra")
    .order("created_at", { ascending: false })
    .limit(1);

  if (!organizations?.length) {
    return (
      <section className="mx-auto my-12 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        <span className="text-[11px] font-bold tracking-widest text-slate-400 uppercase">First things first</span>
        <h2 className="mt-2 text-lg font-bold text-slate-900">Build your OmniRelay workspace</h2>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">
          Tell us about your business. We’ll recommend channels, AI agents and workflows that fit your clinic.
        </p>
        <Link
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition"
          href="/onboarding"
        >
          Start guided setup <ArrowRight className="size-3.5" />
        </Link>
      </section>
    );
  }

  const organization = organizations[0];
  const [
    { data: entitlements },
    { count: locationCount },
    { count: doctorCount },
    { count: serviceCount },
    { data: profile },
    { data: connection },
    { count: pendingActionsCount },
  ] = await Promise.all([
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
    supabase
      .from("organization_services")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("booking_enabled", true),
    supabase
      .from("onboarding_profiles")
      .select("primary_phone,email")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("channel_connections")
      .select("status,display_address,display_name")
      .eq("organization_id", organization.id)
      .eq("channel", "whatsapp")
      .maybeSingle(),
    supabase
      .from("app_notifications")
      .select("id", { count: "exact", head: true })
      .eq("notification_type", "serious_action")
      .is("read_at", null),
  ]);

  const trialEndsLabel = entitlements?.trial_ends_at
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(entitlements.trial_ends_at))
    : "Active";

  const businessCategory =
    (organization.extra as { business_category?: string } | null)
      ?.business_category ?? "Healthcare";

  if (businessCategory === "Retail & e-commerce") {
    redirect("/app/retail");
  }

  const profileReady = Boolean(profile?.primary_phone && profile?.email);
  const isWhatsAppConnected = Boolean(connection && ["connected", "live"].includes(connection.status));

  const setupSteps = [
    {
      title: "Clinic Profile",
      detail: "Add business phone and email for automated patient communications.",
      href: "/app/settings",
      complete: profileReady,
    },
    {
      title: "Clinic Locations",
      detail: "Set up the chamber, consultation rooms, and clinic address.",
      href: "/app/settings",
      complete: (locationCount ?? 0) > 0,
    },
    {
      title: "Bookable Services",
      detail: "Define consultations, appointment durations, and booking slots.",
      href: "/app/settings",
      complete: (serviceCount ?? 0) > 0,
    },
    {
      title: "WhatsApp Cloud API",
      detail: isWhatsAppConnected
        ? `Connected to ${connection?.display_address ?? "WhatsApp Business"}`
        : "Connect Meta Cloud API to automate patient bookings and reminders.",
      href: "/app/integrations",
      complete: isWhatsAppConnected,
    },
  ];

  const completedSteps = setupSteps.filter((s) => s.complete).length;
  const progressPercent = Math.round((completedSteps / setupSteps.length) * 100);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 pb-12 pt-1">
      {/* 1. GLOWING BLACK AI HERO BANNER (Preserved & Enhanced) */}
      <WorkspaceHero
        tag="TODAY'S CLINIC PULSE"
        title={
          <>
            Keep every patient <br className="hidden sm:block" /> journey moving.
          </>
        }
        subtitle={
          <>
            <span className="text-slate-200 font-semibold">{organization.name}</span>
            <span className="text-slate-600">•</span>
            <span>{businessCategory}</span>
            <span className="text-slate-600">•</span>
            <span>{doctorCount ?? 0} doctors</span>
          </>
        }
        action={
          <>
            <Link
              className="group flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 px-4 py-2.5 text-[13px] font-semibold text-white backdrop-blur-md border border-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(255,255,255,0.05)]"
              href="/app/analytics"
            >
              <Sparkles className="size-4 text-teal-400 group-hover:text-teal-300 transition-colors" />
              <span>Deep Analytics</span>
              <ArrowRight className="size-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </Link>
            <Link
              className="group flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-blue-500 hover:from-teal-300 hover:to-blue-400 px-4 py-2.5 text-[13px] font-bold text-slate-950 transition-all duration-300 hover:scale-[1.02] shadow-[0_0_20px_rgba(45,212,191,0.25)] hover:shadow-[0_0_30px_rgba(45,212,191,0.4)]"
              href="/app/appointments"
            >
              <CalendarDays className="size-4" />
              <span>New appointment</span>
            </Link>
          </>
        }
      />

      {/* 2. STAT CARDS (4-COLUMN COMPACT GRID) */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Appointments */}
        <Link
          href="/app/appointments"
          className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs hover:border-slate-300 hover:shadow-xs transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Appointments</span>
            <div className="grid size-7 place-items-center rounded-md bg-slate-100 text-slate-600 group-hover:bg-teal-50 group-hover:text-teal-700 transition">
              <CalendarDays className="size-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-slate-900">0</span>
            <p className="mt-0.5 text-[11px] text-slate-500">Scheduled for today</p>
          </div>
        </Link>

        {/* Card 2: Doctors & Roster */}
        <Link
          href="/app/team"
          className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs hover:border-slate-300 hover:shadow-xs transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active Doctors</span>
            <div className="grid size-7 place-items-center rounded-md bg-slate-100 text-slate-600 group-hover:bg-teal-50 group-hover:text-teal-700 transition">
              <UsersRound className="size-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-slate-900">{doctorCount ?? 0}</span>
            <p className="mt-0.5 text-[11px] text-slate-500">Ready for patient consultations</p>
          </div>
        </Link>

        {/* Card 3: Action Centre */}
        <Link
          href="/app/action-centre"
          className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs hover:border-slate-300 hover:shadow-xs transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Staff Attention</span>
            <div className={`grid size-7 place-items-center rounded-md transition ${
              (pendingActionsCount ?? 0) > 0 ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600 group-hover:bg-teal-50 group-hover:text-teal-700"
            }`}>
              <CircleAlert className="size-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className={`text-2xl font-bold tracking-tight ${(pendingActionsCount ?? 0) > 0 ? "text-rose-600" : "text-slate-900"}`}>
              {pendingActionsCount ?? 0}
            </span>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {(pendingActionsCount ?? 0) > 0 ? "Urgent actions require review" : "All clinical queues clear"}
            </p>
          </div>
        </Link>

        {/* Card 4: WhatsApp Status */}
        <Link
          href="/app/integrations"
          className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs hover:border-slate-300 hover:shadow-xs transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">WhatsApp Channel</span>
            <div className="grid size-7 place-items-center rounded-md bg-slate-100 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-700 transition">
              <MessageSquare className="size-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${isWhatsAppConnected ? "bg-emerald-500" : "bg-amber-400"}`} />
              <span className="text-sm font-bold tracking-tight text-slate-900">
                {isWhatsAppConnected ? "Connected" : "Setup Required"}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {connection?.display_address ?? "Meta Cloud API"}
            </p>
          </div>
        </Link>
      </section>

      {/* 3. MAIN SECTION: ONBOARDING CHECKLIST + CLINIC OPERATIONS WIDGET */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Onboarding Checklist (Left 2 cols) */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
          <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <div>
              <h2 className="text-xs font-bold text-slate-900">Workspace Activation Checklist</h2>
              <p className="text-[11px] text-slate-500">Complete these clinical configurations to start receiving bookings.</p>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-teal-600 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-slate-700">{completedSteps}/{setupSteps.length}</span>
            </div>
          </header>

          <div className="divide-y divide-slate-100">
            {setupSteps.map((step, index) => (
              <Link
                key={step.title}
                href={step.href}
                className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/70 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      step.complete
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200/60"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {step.complete ? <CheckCircle2 className="size-3.5" /> : index + 1}
                  </div>
                  <div className="min-w-0">
                    <span className={`block text-xs font-semibold ${step.complete ? "text-slate-600" : "text-slate-900"}`}>
                      {step.title}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">{step.detail}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold border ${
                      step.complete
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                        : "bg-amber-50 text-amber-700 border-amber-200/50 group-hover:bg-amber-100/60"
                    }`}
                  >
                    {step.complete ? "Ready" : "Action required"}
                  </span>
                  <ArrowRight className="size-3 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Clinical Automation Assistant Card (Right 1 col) */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200/50 uppercase tracking-wide">
                <Sparkles className="size-3" />
                AI Assistant
              </span>
              <span className="text-[11px] text-slate-400 font-medium">WhatsApp OPD</span>
            </div>
            <h3 className="mt-2.5 text-sm font-bold text-slate-900 leading-snug">
              Automated Patient Booking Concierge
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
              When patients message your WhatsApp number, OmniRelay automatically collects their preferred slot, checks doctor availability, and sends instant confirmation.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
            <Link
              href="/app/automations"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition"
            >
              Configure Reminders <ArrowUpRight className="size-3.5 opacity-70" />
            </Link>
            <Link
              href="/app/conversations"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Open Inbox <MessageSquare className="size-3.5 text-slate-400" />
            </Link>
          </div>
        </div>
      </section>

      {/* 4. CLINIC INFRASTRUCTURE & SUBSCRIPTION FOOTER */}
      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs sm:grid-cols-3">
        <div className="flex items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
            <Building2 className="size-4" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bookable Services</span>
            <span className="text-sm font-bold text-slate-900">{serviceCount ?? 0} Services Active</span>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:border-l sm:border-slate-100 sm:pl-4">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
            <ShieldCheck className="size-4 text-teal-600" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Subscription Tier</span>
            <span className="text-sm font-bold text-slate-900 capitalize">{entitlements?.plan_id ?? "Growth"} · {trialEndsLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:border-l sm:border-slate-100 sm:pl-4">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
            <Clock className="size-4 text-indigo-600" />
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Operational Engine</span>
            <span className="text-sm font-bold text-slate-900">99.98% Uptime · Production</span>
          </div>
        </div>
      </section>
    </div>
  );
}
