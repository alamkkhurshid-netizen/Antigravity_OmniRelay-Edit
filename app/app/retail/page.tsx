import Link from "next/link";
import { ArrowRight, Package, Smartphone, Zap, Store, Sparkles, Building2, Users, TrendingUp, Megaphone, Workflow, Target, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function RetailDashboard() {
  const supabase = await createClient();
  const { data: organizations } = await supabase
    .from("organizations")
    .select("name,created_at,extra")
    .order("created_at", { ascending: false })
    .limit(1);

  const organization = organizations?.[0];
  const businessName = organization?.name ?? "Your Store";

  return (
    <div className="grid gap-6 pb-12">
      <header className="flex flex-col gap-4 rounded-[1.4rem] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900 via-slate-900 to-black px-6 py-10 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-black tracking-widest text-indigo-300 ring-1 ring-indigo-400/30">
              <Sparkles className="size-3.5" /> RETAIL AUTOMATION
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-2xl">
              Welcome to {businessName}
            </h1>
            <p className="mt-2 max-w-xl text-indigo-200">
              Automate your catalog, accept orders directly on WhatsApp, and scale your customer support with AI. Select your operating scale to get started.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/app/retail/orders"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600/90 px-4 py-2.5 text-sm font-bold text-white shadow-sm ring-1 ring-inset ring-indigo-500 hover:bg-indigo-600 transition-colors"
            >
              <Package className="size-4" /> Open Order Pipeline
            </Link>
          </div>
        </div>
      </header>

      {/* Quick Action Navigation */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        <Link href="/app/retail/marketing" className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-blue-300 hover:shadow-md">
          <div className="flex size-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
            <Target className="size-6" />
          </div>
          <span className="text-sm font-bold text-slate-700 group-hover:text-blue-600 text-center leading-tight">Meta Ads</span>
        </Link>
        <Link href="/app/retail/calendar" className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-indigo-300 hover:shadow-md">
          <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
            <CalendarDays className="size-6" />
          </div>
          <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-600 text-center leading-tight">Content Calendar</span>
        </Link>
        <Link href="/app/retail/creative" className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-fuchsia-300 hover:shadow-md">
          <div className="flex size-12 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-600 transition-colors group-hover:bg-fuchsia-100">
            <Sparkles className="size-6" />
          </div>
          <span className="text-sm font-bold text-slate-700 group-hover:text-fuchsia-600 text-center leading-tight">Creative Engine</span>
        </Link>
        <Link href="/app/retail/customers" className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-indigo-300 hover:shadow-md">
          <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
            <Users className="size-6" />
          </div>
          <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-600">Customer CRM</span>
        </Link>
        <Link href="/app/retail/analytics" className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-emerald-300 hover:shadow-md">
          <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
            <TrendingUp className="size-6" />
          </div>
          <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-600">Analytics</span>
        </Link>
        <Link href="/app/retail/broadcasts" className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-rose-300 hover:shadow-md">
          <div className="flex size-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition-colors group-hover:bg-rose-100">
            <Megaphone className="size-6" />
          </div>
          <span className="text-sm font-bold text-slate-700 group-hover:text-rose-600">Broadcasts</span>
        </Link>
        <Link href="/app/retail/flows" className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-violet-300 hover:shadow-md">
          <div className="flex size-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600 transition-colors group-hover:bg-violet-100">
            <Workflow className="size-6" />
          </div>
          <span className="text-sm font-bold text-slate-700 group-hover:text-violet-600">Flow Builder</span>
        </Link>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-3">
        {/* SMALL TIER */}
        <article className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10">
          <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-indigo-50 opacity-50 transition-transform group-hover:scale-150"></div>
          <div className="relative">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <Store className="size-6" />
            </span>
            <h3 className="mt-5 text-xl font-bold tracking-tight text-slate-900">Small Business</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Perfect for single stores and local sellers. Setup in 2 minutes. Add your top 5 products directly and start accepting raw orders in WhatsApp.
            </p>
            <ul className="mt-6 grid gap-2.5 text-sm text-slate-600">
              <li className="flex items-center gap-2"><ArrowRight className="size-4 text-indigo-500" /> Zero coding required</li>
              <li className="flex items-center gap-2"><ArrowRight className="size-4 text-indigo-500" /> Static Flow Catalog</li>
              <li className="flex items-center gap-2"><ArrowRight className="size-4 text-indigo-500" /> WhatsApp inbox management</li>
            </ul>
          </div>
          <div className="relative mt-8">
            <Link
              href="/app/retail/catalog"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-slate-800"
            >
              Start Small <ArrowRight className="size-4" />
            </Link>
          </div>
        </article>

        {/* MEDIUM TIER */}
        <article className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-sky-500/10">
          <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-sky-50 opacity-50 transition-transform group-hover:scale-150"></div>
          <div className="relative">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
              <Smartphone className="size-6" />
            </span>
            <h3 className="mt-5 text-xl font-bold tracking-tight text-slate-900">Growing Brand</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Connect your Meta Commerce Manager. Sync hundreds of products dynamically. Build custom workflows and integrate CRM webhooks.
            </p>
            <ul className="mt-6 grid gap-2.5 text-sm text-slate-600">
              <li className="flex items-center gap-2"><ArrowRight className="size-4 text-sky-500" /> Live Meta Catalog Sync</li>
              <li className="flex items-center gap-2"><ArrowRight className="size-4 text-sky-500" /> Dynamic Category Filters</li>
              <li className="flex items-center gap-2"><ArrowRight className="size-4 text-sky-500" /> CRM Order Routing</li>
            </ul>
          </div>
          <div className="relative mt-8">
            <button
              disabled
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-400 transition-all"
            >
              Coming Soon
            </button>
          </div>
        </article>

        {/* LARGE TIER */}
        <article className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-fuchsia-500/10">
          <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-fuchsia-50 opacity-50 transition-transform group-hover:scale-150"></div>
          <div className="relative">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-fuchsia-100 text-fuchsia-600">
              <Building2 className="size-6" />
            </span>
            <h3 className="mt-5 text-xl font-bold tracking-tight text-slate-900">Enterprise</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Real-time API data exchange. Connect directly to your ERP (SAP/Salesforce). Live stock checks and automated consumer drip loops.
            </p>
            <ul className="mt-6 grid gap-2.5 text-sm text-slate-600">
              <li className="flex items-center gap-2"><ArrowRight className="size-4 text-fuchsia-500" /> 2048-bit Encrypted Payload</li>
              <li className="flex items-center gap-2"><ArrowRight className="size-4 text-fuchsia-500" /> Native WhatsApp Payments</li>
              <li className="flex items-center gap-2"><ArrowRight className="size-4 text-fuchsia-500" /> Real-time Warehouse ERP</li>
            </ul>
          </div>
          <div className="relative mt-8">
            <button
              disabled
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-400 transition-all"
            >
              Contact Sales
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
