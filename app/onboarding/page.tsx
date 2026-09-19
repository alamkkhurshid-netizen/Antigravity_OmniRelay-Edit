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

  return <main className="min-h-screen bg-[radial-gradient(circle_at_85%_5%,#dff8fa,transparent_28%),#f5f7fb] text-[#173047]">
    <header className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
      <Brand className="h-11 w-44" />
      <span className="rounded-full border border-[#d4e4e7] bg-white px-3 py-2 text-xs font-black tracking-[.12em] text-[#26728b]">SETUP · 1 OF 4</span>
    </header>
    <section className="mx-auto grid w-full max-w-7xl gap-8 px-5 pb-10 pt-3 sm:px-8 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:px-10">
      <div className="max-w-xl py-5 lg:py-12">
        <span className="inline-flex items-center gap-2 text-xs font-black tracking-[.16em] text-[#1688a6]"><Sparkles className="size-4" /> YOUR WORKSPACE</span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#173047] sm:text-5xl">Start with the business you run today.</h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-[#637783]">A few details let OmniRelay create the right workspace foundation. You can refine services, schedules, team access and workflows later.</p>
        <ul className="mt-8 grid gap-3">
          <li className="flex gap-3 rounded-2xl border border-[#dbe8e8] bg-white/75 p-4"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#169e8b]" /><span><b className="block text-sm">Nothing is activated automatically</b><small className="mt-1 block text-sm leading-5 text-[#6e8089]">Booking, reminders and WhatsApp stay under your control.</small></span></li>
          <li className="flex gap-3 rounded-2xl border border-[#dbe8e8] bg-white/75 p-4"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#1688a6]" /><span><b className="block text-sm">Safe to start small</b><small className="mt-1 block text-sm leading-5 text-[#6e8089]">Set up one location first, then add the rest when ready.</small></span></li>
        </ul>
      </div>
      <OnboardingForm />
    </section>
  </main>;
}
