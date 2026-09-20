import Link from "next/link";
import { ArrowRight, Bot, MessageCircleMore, Sparkles, UsersRound, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="grid gap-6 pb-10 xl:grid-cols-4">
      {/* Hero Banner */}
      <section className="xl:col-span-4 flex flex-col gap-6 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-[#071a31] to-[#0a2540] px-8 py-10 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between relative">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-[#18bfc5]/20 to-transparent blur-3xl -z-10 rounded-full opacity-60" />
        <div className="z-10">
          <span className="inline-flex items-center gap-2 text-xs font-bold tracking-widest text-[#18bfc5] uppercase">
            <Sparkles className="size-4" /> Workspace Pulse
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
            Ready to automate your operations.
          </h2>
          <p className="mt-3 text-base text-slate-300 max-w-xl">
            Your OmniRelay workspace is ready. Connect a channel to start answering FAQs, scheduling appointments, and capturing leads automatically.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 z-10">
          <Link className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/20 backdrop-blur-md border border-white/10 transition-all" href="/app/analytics">
            <Sparkles className="size-4 text-[#18bfc5]" /> View Insights
          </Link>
          <Link className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#087fb9] to-[#18bfc5] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#087fb9]/20 hover:shadow-xl transition-all" href="/app/settings">
            <Zap className="size-4" /> Connect WhatsApp
          </Link>
        </div>
      </section>

      {/* Stats Row */}
      {[
        ["Total Conversations", "0", "Awaiting connection", MessageCircleMore, "text-slate-900"],
        ["Active AI Agents", "0", "Ready to deploy", Bot, "text-slate-900"],
        ["Resolution Rate", "—", "Insufficient data", Sparkles, "text-slate-900"],
        ["Total Audience", "0", "No contacts yet", UsersRound, "text-slate-900"],
      ].map(([label, value, detail, Icon, valueClass]) => (
        <StatCard 
          key={label as string} 
          label={label as string} 
          value={value as string} 
          detail={detail as string} 
          icon={<Icon className="size-5 text-[#087fb9]"/>} 
          valueClassName={valueClass as string}
        />
      ))}

      {/* Onboarding Checklist */}
      <section className="xl:col-span-3 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-slate-900">Your next best steps</h3>
            <p className="text-sm text-slate-500 mt-1">Complete these to get your workspace fully operational.</p>
          </div>
          <span className="rounded-full bg-[#18bfc5]/10 px-3 py-1.5 text-xs font-bold text-[#087fb9]">0 / 3 ready</span>
        </header>
        <div className="divide-y divide-slate-100 px-6">
          {[
            ["Connect WhatsApp", "Link your official Meta business number to start receiving messages.", "/app/settings", false],
            ["Upload Knowledge Base", "Add your menus, FAQs, or service catalogs to train your AI.", "/app/agents", false],
            ["Configure Auto-Replies", "Set up your away hours and escalation paths.", "/app/conversations", false],
          ].map(([title, detail, href, complete], index) => (
            <Link className="group flex items-center gap-4 py-5 hover:bg-slate-50 transition-colors -mx-6 px-6" href={href as string} key={title as string}>
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl font-semibold text-sm ${complete ? "bg-emerald-100 text-emerald-700" : "bg-[#087fb9]/10 text-[#087fb9]"}`}>
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-sm font-semibold text-slate-900">{title}</b>
                <span className="mt-1 block text-sm text-slate-500">{detail}</span>
              </span>
              <ArrowRight className="size-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-[#087fb9]" />
            </Link>
          ))}
        </div>
      </section>

      {/* Quick Action */}
      <section className="rounded-3xl border border-[#18bfc5]/30 bg-gradient-to-br from-[#18bfc5]/5 to-transparent p-6 shadow-sm flex flex-col justify-between">
        <div>
          <span className="text-xs font-bold tracking-widest text-[#087fb9] uppercase">Pro Tip</span>
          <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">Explore Agentic Workflows</h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Learn how OmniRelay's agents can handle complex multi-turn conversations without human intervention.
          </p>
        </div>
        <Link className="mt-6 inline-flex w-fit items-center gap-2 text-sm font-bold text-[#087fb9] hover:text-[#18bfc5] transition-colors" href="/app/agents">
          View workflow templates <ArrowRight className="size-4" />
        </Link>
      </section>
    </div>
  );
}
