import { redirect } from "next/navigation";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Brand } from "@/components/brand";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A user email is permanently locked to their single clinic profile
  const { data: existingAgent } = await supabase
    .from("agents")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("ai", false)
    .limit(1)
    .maybeSingle();

  if (existingAgent?.organization_id) {
    redirect("/app");
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-[#087fb9]/20 selection:text-[#087fb9]">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-[#18bfc5]/10 to-transparent blur-3xl -z-10 rounded-full opacity-60" />
      
      <header className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10 border-b border-slate-200/60">
        <Brand className="h-11 w-44" />
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold tracking-widest text-[#087fb9] shadow-sm">
          SETUP · 1 OF 4
        </span>
      </header>
      
      <section className="mx-auto grid w-full max-w-7xl gap-12 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[.9fr_1.1fr] lg:items-start lg:px-10">
        <div className="max-w-xl py-5 lg:py-12">
          <span className="inline-flex items-center gap-2 text-xs font-bold tracking-widest text-[#18bfc5] uppercase">
            <Sparkles className="size-4" /> Your Workspace
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl leading-[1.1]">
            Start with the business you run today.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-500">
            A few details let OmniRelay create the right workspace foundation. You can refine services, schedules, team access and workflows later.
          </p>
          
          <ul className="mt-10 grid gap-4">
            <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-[#18bfc5]/30 transition-all">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
              <span>
                <b className="block text-sm font-semibold text-slate-900">Nothing is activated automatically</b>
                <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">
                  Booking, reminders and WhatsApp stay under your control.
                </span>
              </span>
            </li>
            <li className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-[#087fb9]/30 transition-all">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#087fb9]" />
              <span>
                <b className="block text-sm font-semibold text-slate-900">Safe to start small</b>
                <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">
                  Set up one location first, then add the rest when ready.
                </span>
              </span>
            </li>
          </ul>
        </div>
        
        <div className="lg:mt-4">
          <OnboardingForm />
        </div>
      </section>
    </main>
  );
}
