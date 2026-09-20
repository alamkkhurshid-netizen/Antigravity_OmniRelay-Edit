import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in - OmniRelay" };

const Logo = () => (
  <Link href="/" className="flex items-center gap-3 group">
    <div className="relative w-[140px] h-[40px] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/omnirelay-logo.jpeg" alt="OmniRelay" className="object-contain w-full h-full mix-blend-multiply" />
    </div>
  </Link>
);

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.1fr_.9fr] selection:bg-[#087fb9]/20 selection:text-[#087fb9] font-sans">
      <section className="flex flex-col justify-between p-8 sm:p-12 lg:p-16 border-r border-slate-200/80 bg-white relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-gradient-to-br from-[#087fb9]/5 to-transparent blur-3xl -z-10 rounded-full opacity-70" />
        
        <div className="z-10">
          <Logo />
        </div>
        
        <div className="my-16 max-w-2xl z-10">
          <span className="text-xs font-bold tracking-widest text-[#18bfc5] uppercase mb-4 block">Clinic Operations</span>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl leading-tight">
            One calm workspace for every patient journey.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-500">
            Manage conversations, appointments, agents and automations without
            stitching together five different tools.
          </p>
        </div>
        
        <ul className="grid gap-4 sm:grid-cols-3 z-10">
          <li className="rounded-2xl border border-slate-200/80 bg-white/50 backdrop-blur-sm p-5 hover:border-[#087fb9]/30 hover:shadow-sm transition-all">
            <b className="block text-sm font-semibold text-slate-900">Secure workspace</b>
            <span className="mt-1.5 block text-xs text-slate-500 leading-relaxed">Your clinic controls access</span>
          </li>
          <li className="rounded-2xl border border-slate-200/80 bg-white/50 backdrop-blur-sm p-5 hover:border-[#087fb9]/30 hover:shadow-sm transition-all">
            <b className="block text-sm font-semibold text-slate-900">Patient lifecycle</b>
            <span className="mt-1.5 block text-xs text-slate-500 leading-relaxed">Bookings, care and follow-up</span>
          </li>
          <li className="rounded-2xl border border-slate-200/80 bg-white/50 backdrop-blur-sm p-5 hover:border-[#087fb9]/30 hover:shadow-sm transition-all">
            <b className="block text-sm font-semibold text-slate-900">WhatsApp-first</b>
            <span className="mt-1.5 block text-xs text-slate-500 leading-relaxed">Controlled patient messaging</span>
          </li>
        </ul>
      </section>
      
      <section className="grid place-items-center p-6 sm:p-12 relative z-10">
        <LoginForm />
      </section>
    </main>
  );
}
