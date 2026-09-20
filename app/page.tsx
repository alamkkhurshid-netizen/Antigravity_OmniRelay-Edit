"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, MessagesSquare, ShieldCheck, Zap } from "lucide-react";

const Mark = () => (
  <div className="relative inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#087fb9]/10 to-[#18bfc5]/10 border border-[#087fb9]/20 shadow-sm">
    <div className="absolute w-4 h-4 rounded-full border-[3px] border-[#18bfc5] top-2 left-1.5 opacity-80 mix-blend-multiply" />
    <div className="absolute w-4 h-4 rounded-full border-[3px] border-[#087fb9] bottom-2 right-1.5 opacity-80 mix-blend-multiply" />
  </div>
);

const Logo = () => (
  <Link href="/" className="flex items-center gap-3 group">
    <div className="relative w-[140px] h-[40px] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/omnirelay-logo.jpeg" alt="OmniRelay" className="object-contain w-full h-full mix-blend-multiply" />
    </div>
  </Link>
);

export default function Home() {
  const [menu, setMenu] = useState(false);

  return (
    <main className="min-h-screen bg-white text-slate-900 font-sans selection:bg-[#087fb9]/20 selection:text-[#087fb9]">
      
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          
          <div className={`fixed inset-0 bg-white z-40 p-6 pt-24 lg:static lg:p-0 lg:bg-transparent lg:flex lg:items-center lg:gap-8 ${menu ? "flex flex-col" : "hidden"}`}>
            <a href="#problem" className="text-sm font-medium text-slate-600 hover:text-[#087fb9] transition-colors py-2 lg:py-0">The Problem</a>
            <a href="#platform" className="text-sm font-medium text-slate-600 hover:text-[#087fb9] transition-colors py-2 lg:py-0">Features</a>
            <a href="#compare" className="text-sm font-medium text-slate-600 hover:text-[#087fb9] transition-colors py-2 lg:py-0">Compare</a>
            <a href="#security" className="text-sm font-medium text-slate-600 hover:text-[#087fb9] transition-colors py-2 lg:py-0">Security</a>
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-[#087fb9] transition-colors py-2 lg:py-0 lg:ml-4">Sign in</Link>
          </div>

          <div className="flex items-center gap-4 z-50">
            <Link href="/login" className="hidden lg:inline-flex items-center justify-center px-4 h-9 rounded-lg bg-[#087fb9] text-white text-sm font-semibold hover:bg-[#066d9c] transition-all shadow-sm">
              Deploy Your AI Agent
            </Link>
            <button className="lg:hidden p-2 -mr-2 text-slate-600" onClick={() => setMenu(!menu)} aria-label="Toggle menu">
              <div className="w-5 h-0.5 bg-current mb-1.5" />
              <div className="w-5 h-0.5 bg-current" />
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-20 overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-[#087fb9]/10 to-transparent blur-3xl -z-10 pointer-events-none rounded-full opacity-50" />
        
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-8 items-center">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200/60 mb-6">
              <span className="w-2 h-2 rounded-full bg-[#18bfc5] animate-pulse" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">OmniRelay for Healthcare</span>
            </div>
            
            <h1 className="text-4xl lg:text-[64px] leading-[1.1] font-semibold tracking-tight text-slate-900 mb-6">
              Turn WhatsApp into your clinic’s 24/7 intelligent sales and <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#087fb9] to-[#18bfc5]">operations engine.</span>
            </h1>
            
            <p className="text-lg text-slate-500 leading-relaxed max-w-xl mb-8">
              Stop losing patients to slow response times and manual messaging. OmniRelay deploys secure, document-trained AI agents directly onto your WhatsApp business line—turning inquiries into confirmed bookings in seconds.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              <Link href="/login" className="w-full sm:w-auto inline-flex items-center justify-center px-6 h-12 rounded-xl bg-gradient-to-r from-[#087fb9] to-[#18bfc5] text-white text-sm font-semibold hover:opacity-90 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5">
                Deploy Your AI Agent
              </Link>
              <Link href="/onboarding" className="w-full sm:w-auto inline-flex items-center justify-center px-6 h-12 rounded-xl bg-white text-slate-700 text-sm font-semibold border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                Explore Interactive Sandbox
              </Link>
            </div>
          </div>
          
          {/* Dashboard Visual */}
          <div className="relative w-full aspect-square lg:aspect-auto lg:h-[500px] z-10">
            <div className="absolute inset-0 border border-[#087fb9]/10 rounded-full border-dashed animate-[spin_60s_linear_infinite]" />
            <div className="absolute inset-8 border border-[#18bfc5]/10 rounded-full border-dashed animate-[spin_40s_linear_infinite_reverse]" />
            
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border border-slate-200/80 rounded-2xl shadow-xl p-6 z-20">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
                <div className="flex items-center gap-3">
                  <Mark />
                  <span className="text-xs font-semibold text-slate-400 tracking-wider">PATIENT INQUIRY</span>
                </div>
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              </div>
              
              <div className="mb-4">
                <div className="inline-block p-3 rounded-2xl rounded-tl-sm bg-slate-100 text-sm text-slate-700 mb-3 max-w-[85%]">
                  Do you have any available slots for Dr. Sen this evening? It's an emergency.
                </div>
                <div className="flex justify-end">
                  <div className="inline-block p-3 rounded-2xl rounded-tr-sm bg-[#087fb9] text-white text-sm max-w-[85%] shadow-sm">
                    Yes, I can squeeze you in for an emergency consult with Dr. Sen at 7:30 PM today. Would you like me to confirm this slot?
                  </div>
                </div>
              </div>
              
              <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">RAG Agent Response Time</span>
                <span className="text-xs font-bold text-green-600">0.8s</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cloud Logos */}
      <section className="border-y border-slate-100 bg-slate-50 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <span className="text-xs font-semibold text-slate-500 tracking-widest uppercase mb-6 block">Trusted by modern healthcare operators scaling without friction</span>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 items-center opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
            {['APEX CLINIC', 'MEDICARE', 'NEXUS DIAGNOSTICS', '◈ RADIANT HEALTH', 'CAREPLUS'].map((logo, i) => (
              <span key={i} className="text-base font-bold text-slate-700">{logo}</span>
            ))}
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section id="problem" className="py-16 lg:py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="text-xs font-bold text-[#18bfc5] tracking-widest uppercase mb-4 block">The Problem</span>
          <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 mb-6">
            WhatsApp is where your patients are. It’s also where your ops break down.
          </h2>
          <p className="text-lg text-slate-500 leading-relaxed">
            Manual replies miss booking windows. Static chatbots feel robotic and frustrate patients. And setting up enterprise-grade automation usually requires weeks of engineering and fragile middleware. You deserve an operations platform built for speed, privacy, and zero-touch deployment.
          </p>
        </div>
      </section>

      {/* Platform Section (What We Deliver) */}
      <section id="platform" className="py-16 lg:py-24 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-[#087fb9] tracking-widest uppercase mb-4 block">What We Deliver</span>
            <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900">
              Everything your clinic needs,<br />unified in a single WhatsApp-first layer.
            </h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <article className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-[#18bfc5]/30 transition-all">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#18bfc5]/10 text-[#18bfc5] mb-6">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Instant Document-Trained RAG</h3>
              <p className="text-slate-500 leading-relaxed text-sm">
                Upload your clinic brochures, price lists, and schedules. OmniRelay ingests them instantly, training a localized AI agent that answers patient questions with 100% factual accuracy.
              </p>
            </article>

            <article className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-[#087fb9]/30 transition-all">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#087fb9]/10 text-[#087fb9] mb-6">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Meta Embedded Signup</h3>
              <p className="text-slate-500 leading-relaxed text-sm">
                Connect your official WhatsApp Business Account (WABA) in one click. Zero complex API routing, full compliance, and customer-owned billing.
              </p>
            </article>

            <article className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-[#087fb9]/30 transition-all">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 mb-6">
                <MessagesSquare className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Unified Team Inbox & Handoff</h3>
              <p className="text-slate-500 leading-relaxed text-sm">
                When a patient needs a human touch, the conversation flows seamlessly into a shared team inbox with full context history and smart scheduling tags.
              </p>
            </article>

            <article className="p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-[#18bfc5]/30 transition-all">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 mb-6">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Automated Appointment Loops</h3>
              <p className="text-slate-500 leading-relaxed text-sm">
                Proactive booking confirmations, intelligent rescheduling, and automated reminders that slash no-show rates to near zero.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Comparison Section (What Value We Add) */}
      <section id="compare" className="py-16 lg:py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-bold text-[#18bfc5] tracking-widest uppercase mb-4 block">What Value We Add</span>
            <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900">
              Engineered for absolute trust and immediate ROI.
            </h2>
          </div>

          <div className="rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-2 bg-slate-50 border-b border-slate-200">
              <div className="p-6 font-semibold text-slate-500 text-center border-r border-slate-200">Traditional Chatbots</div>
              <div className="p-6 font-semibold text-[#087fb9] text-center flex items-center justify-center gap-2">
                <Mark /> OmniRelay
              </div>
            </div>
            
            <div className="grid grid-cols-2 border-b border-slate-100 bg-white">
              <div className="p-6 text-sm text-slate-500 border-r border-slate-100 flex items-center">
                <span className="text-red-400 mr-3">✕</span> Generic templates with frequent hallucinations
              </div>
              <div className="p-6 text-sm font-medium text-slate-900 flex items-center">
                <span className="text-green-500 mr-3">✓</span> Grounded entirely in your verified clinic documents
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-100 bg-white">
              <div className="p-6 text-sm text-slate-500 border-r border-slate-100 flex items-center">
                <span className="text-red-400 mr-3">✕</span> Days of technical setup and webhook debugging
              </div>
              <div className="p-6 text-sm font-medium text-slate-900 flex items-center">
                <span className="text-green-500 mr-3">✓</span> Live in under 5 minutes via drag-and-drop ingestion
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-slate-100 bg-white">
              <div className="p-6 text-sm text-slate-500 border-r border-slate-100 flex items-center">
                <span className="text-red-400 mr-3">✕</span> Fragmented data shared across random third parties
              </div>
              <div className="p-6 text-sm font-medium text-slate-900 flex items-center">
                <span className="text-green-500 mr-3">✓</span> Strict tenant isolation powered by encrypted Supabase vectors
              </div>
            </div>

            <div className="grid grid-cols-2 bg-white">
              <div className="p-6 text-sm text-slate-500 border-r border-slate-100 flex items-center">
                <span className="text-red-400 mr-3">✕</span> Cold, frustrating text blocks
              </div>
              <div className="p-6 text-sm font-medium text-slate-900 flex items-center">
                <span className="text-green-500 mr-3">✓</span> Human-empathetic, WhatsApp-optimized conversational flow
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-16 lg:py-24 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-[#087fb9]/30 to-transparent blur-3xl rounded-full opacity-50 -translate-y-1/2 translate-x-1/4" />
        
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <ShieldCheck className="w-12 h-12 text-[#18bfc5] mx-auto mb-6" />
          <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight mb-6">
            Built for Enterprise Security
          </h2>
          <p className="text-lg text-slate-400 leading-relaxed mb-10">
            Your clinic data belongs to you—and only you. OmniRelay enforces strict, tenant-scoped data partitioning, zero-retention metadata logging, and complete alignment with healthcare privacy standards. Your data never trains public models.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 lg:py-24 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto text-center">
          <span className="text-xs font-bold text-[#087fb9] tracking-widest uppercase mb-4 block">Get Started</span>
          <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 mb-6">
            Ready to modernize your clinic operations?
          </h2>
          <p className="text-slate-500 mb-10">
            Deploy your secure WhatsApp sales agent today. No credit card required to test the sandbox.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login" className="w-full sm:w-auto inline-flex items-center justify-center px-8 h-12 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all shadow-md">
              Deploy Your AI Agent
            </Link>
            <Link href="/onboarding" className="w-full sm:w-auto inline-flex items-center justify-center px-8 h-12 rounded-xl bg-white text-slate-700 font-semibold border border-slate-200 hover:bg-slate-50 transition-all shadow-sm">
              Explore Interactive Sandbox
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          <div className="flex flex-col gap-4">
            <Logo />
            <p className="text-sm text-slate-500 leading-relaxed max-w-[240px]">
              The AI business operating system built for infinite momentum in healthcare.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <span className="text-xs font-bold text-slate-900 tracking-wider">PLATFORM</span>
            <a href="#platform" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">Features</a>
            <a href="#compare" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">Compare</a>
            <a href="#security" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">Security</a>
          </div>
          <div className="flex flex-col gap-4">
            <span className="text-xs font-bold text-slate-900 tracking-wider">COMPANY</span>
            <a href="/about" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">About us</a>
            <a href="/contact" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">Contact</a>
          </div>
          <div className="flex flex-col gap-4">
            <span className="text-xs font-bold text-slate-900 tracking-wider">LEGAL</span>
            <a href="/privacy" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">Privacy Policy</a>
            <a href="/terms" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">Terms of Service</a>
            <a href="/data-deletion" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">Data Deletion</a>
          </div>
        </div>
        <div className="max-w-7xl mx-auto border-t border-slate-100 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-sm text-slate-400">© 2026 OmniRelay. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <a href="/privacy" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">Privacy</a>
            <a href="/terms" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
