"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const Mark = () => (
  <div className="relative inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#087fb9]/10 to-[#18bfc5]/10 border border-[#087fb9]/20 shadow-sm">
    <div className="absolute w-4 h-4 rounded-full border-[3px] border-[#18bfc5] top-2 left-1.5 opacity-80 mix-blend-multiply" />
    <div className="absolute w-4 h-4 rounded-full border-[3px] border-[#087fb9] bottom-2 right-1.5 opacity-80 mix-blend-multiply" />
  </div>
);

const Logo = () => (
  <Link href="/" className="flex items-center gap-3 group">
    <div className="relative w-[180px] h-[52px] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/new-logo.png" alt="OmniRelay" className="object-contain w-full h-full mix-blend-multiply" />
    </div>
  </Link>
);

const verticals = [
  ["🏥", "Clinics & Healthcare", "Automate patient appointment scheduling, pre-consultation FAQs, and proactive visit reminders while protecting sensitive data with strict tenant isolation."],
  ["🍽️", "Restaurants & Hospitality", "Manage table reservations, handle menu and dietary inquiries, and streamline guest communication without tying up front-of-house staff."],
  ["🛍️", "Retail & E-commerce", "Instantly answer stock availability, product specifications, pricing questions, and order tracking straight through a native chat thread."]
];

const deliverables = [
  ["DOCUMENT RAG", "Instant Document-Trained RAG", "Upload your menus, service catalogs, price lists, or operating schedules. OmniRelay ingests them instantly, training an AI agent that answers customer questions with absolute factual precision."],
  ["META SIGNUP", "Meta Embedded Signup", "Connect your official WhatsApp Business Account (WABA) in one click. Zero complex API routing, full compliance, and customer-owned billing."],
  ["UNIFIED INBOX", "Unified Team Inbox & Handoff", "When a customer needs a human touch, the conversation flows seamlessly into a shared team inbox equipped with full context history and smart tagging."],
  ["ASYNC ONBOARDING", "Asynchronous Onboarding", "Drag and drop your data files; our backend parses and vectorizes everything automatically. No engineering required."]
];

export default function Home() {
  const [menu, setMenu] = useState(false);
  const [flow, setFlow] = useState(0);

  return (
    <main className="min-h-screen bg-white text-slate-900 font-sans selection:bg-[#087fb9]/20 selection:text-[#087fb9]">
      
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Logo />
          
          <div className={`fixed inset-0 bg-white z-40 p-6 pt-24 lg:static lg:p-0 lg:bg-transparent lg:flex lg:items-center lg:gap-8 ${menu ? "flex flex-col" : "hidden"}`}>
            <a href="#platform" className="text-sm font-medium text-slate-600 hover:text-[#087fb9] transition-colors py-2 lg:py-0">Platform</a>
            <a href="#solutions" className="text-sm font-medium text-slate-600 hover:text-[#087fb9] transition-colors py-2 lg:py-0">Solutions</a>
            <a href="#results" className="text-sm font-medium text-slate-600 hover:text-[#087fb9] transition-colors py-2 lg:py-0">Results</a>
            <a href="#impact" className="text-sm font-medium text-slate-600 hover:text-[#087fb9] transition-colors py-2 lg:py-0">Impact</a>
            <Link href="/about" className="text-sm font-medium text-slate-600 hover:text-[#087fb9] transition-colors py-2 lg:py-0">About</Link>
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-[#087fb9] transition-colors py-2 lg:py-0 lg:ml-4">Sign in</Link>
          </div>

          <div className="flex items-center gap-4 z-50">
            <Link href="/login" className="hidden lg:inline-flex items-center justify-center px-5 h-10 rounded-xl bg-[#087fb9] text-white text-sm font-semibold hover:bg-[#066d9c] transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5">
              Start free trial
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
        
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-16 lg:gap-8 items-center">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200/60 mb-8">
              <span className="w-2 h-2 rounded-full bg-[#18bfc5] animate-pulse" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">The AI Operating Layer for Business</span>
            </div>
            
            <h1 className="text-5xl lg:text-[72px] leading-[1.05] font-semibold tracking-tight text-slate-900 mb-6">
              One system.<br />
              Every conversation.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#087fb9] to-[#18bfc5]">Infinite momentum.</span>
            </h1>
            
            <p className="text-lg lg:text-xl text-slate-500 leading-relaxed max-w-2xl mb-10">
              Connect your teams, customers and workflows in one intelligent operating system—so your business can respond, decide and grow without limits.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              <a href="#demo" className="w-full sm:w-auto inline-flex items-center justify-center px-6 h-12 rounded-xl bg-gradient-to-r from-[#087fb9] to-[#18bfc5] text-white text-sm font-semibold hover:opacity-90 transition-all shadow-[0_4px_14px_rgba(8,127,185,0.3)] hover:shadow-[0_6px_20px_rgba(8,127,185,0.4)] hover:-translate-y-0.5">
                Book a demo
              </a>
              <a href="#platform" className="w-full sm:w-auto inline-flex items-center justify-center px-6 h-12 rounded-xl bg-white text-slate-700 text-sm font-semibold border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all">
                Explore the platform
              </a>
            </div>

            <div className="mt-12 flex items-center gap-4">
              <div className="flex -space-x-3">
                {['KA', 'MR', 'JS'].map((initials, i) => (
                  <div key={initials} className="w-10 h-10 rounded-full bg-white border-2 border-white shadow-sm flex items-center justify-center text-xs font-bold text-[#087fb9] bg-[#087fb9]/5 ring-1 ring-slate-200">
                    {initials}
                  </div>
                ))}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-900">98.5%</span>
                <span className="text-xs text-slate-500">resolution rate across teams</span>
              </div>
            </div>
          </div>
          
          {/* Dashboard Visual */}
          <div className="relative w-full aspect-square lg:aspect-auto lg:h-[600px] z-10">
            <div className="absolute inset-0 border border-[#087fb9]/10 rounded-full border-dashed animate-[spin_60s_linear_infinite]" />
            <div className="absolute inset-8 border border-[#18bfc5]/10 rounded-full border-dashed animate-[spin_40s_linear_infinite_reverse]" />
            
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border border-slate-200/80 rounded-2xl shadow-[0_20px_60px_-15px_rgba(8,127,185,0.1)] p-6 z-20">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
                <div className="flex items-center gap-3">
                  <Mark />
                  <span className="text-xs font-semibold text-slate-400 tracking-wider">LIVE OVERVIEW</span>
                </div>
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              </div>
              
              <div className="mb-6">
                <span className="text-[10px] font-bold text-[#18bfc5] tracking-widest uppercase">Good morning, Khurshid</span>
                <h3 className="text-xl font-semibold text-slate-900 mt-1">Your business is moving.</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <span className="block text-xs font-medium text-slate-500 mb-2">Conversations</span>
                  <span className="block text-2xl font-semibold text-slate-900">12,540</span>
                  <span className="block text-xs font-medium text-green-600 mt-1">↑ 16.6%</span>
                </div>
                <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <span className="block text-xs font-medium text-slate-500 mb-2">Resolved</span>
                  <span className="block text-2xl font-semibold text-slate-900">98.5%</span>
                  <span className="block text-xs font-medium text-green-600 mt-1">↑ 12.4%</span>
                </div>
              </div>
              
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                <span className="text-xs font-medium text-slate-500 tracking-wider">LIVE ACTIVITY</span>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-white border border-slate-100 text-sm">
                    <span className="text-green-500 font-bold">✓</span>
                    <span className="flex-1 font-medium text-slate-700">Customer resolved</span>
                    <span className="text-xs text-slate-400">Now</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-white border border-slate-100 text-sm">
                    <span className="text-[#087fb9] font-bold">⌁</span>
                    <span className="flex-1 font-medium text-slate-700">Workflow completed</span>
                    <span className="text-xs text-slate-400">2m</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="absolute -left-6 top-1/4 bg-white border border-slate-200/80 rounded-xl p-4 shadow-xl z-30 hidden sm:block">
              <span className="block text-[10px] font-bold text-[#087fb9] tracking-wider uppercase mb-1">AI SIGNAL</span>
              <span className="block text-sm font-semibold text-slate-900">Opportunity detected</span>
              <span className="block text-xs text-slate-500 mt-1">Enterprise account · High intent</span>
            </div>
            
            <div className="absolute -right-4 bottom-1/4 bg-white border border-slate-200/80 rounded-xl p-4 shadow-xl z-30 hidden sm:flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center font-bold">✓</div>
              <div>
                <span className="block text-sm font-semibold text-slate-900">98.5%</span>
                <span className="block text-xs text-slate-500">Resolved</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cloud Logos */}
      <section className="border-y border-slate-100 bg-slate-50 py-10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <span className="text-xs font-semibold text-slate-400 tracking-widest uppercase mb-8 block">Trusted by forward-thinking teams</span>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 items-center opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
            {['ACME', 'NEXORA', 'Vertex', '◈ PULSAR', 'gridline'].map((logo, i) => (
              <span key={i} className="text-lg font-bold text-slate-700">{logo}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Section */}
      <section id="platform" className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-[1fr_auto] gap-8 items-end mb-16">
            <div>
              <span className="text-xs font-bold text-[#18bfc5] tracking-widest uppercase mb-4 block">Core Verticals</span>
              <h2 className="text-4xl lg:text-5xl font-semibold tracking-tight text-slate-900 leading-tight">
                One Platform. Three Core Verticals.<br /><span className="text-[#087fb9]">Zero Friction.</span>
              </h2>
            </div>
            <p className="text-slate-500 max-w-md text-lg leading-relaxed">
              Customized intelligence tailored to how your industry operates.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {verticals.map((v, i) => (
              <article key={v[1]} className="group p-8 rounded-2xl bg-white border border-slate-200 hover:border-[#087fb9]/30 hover:shadow-[0_8px_30px_rgba(8,127,185,0.06)] transition-all duration-300">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-6 ${
                  i === 0 ? "bg-[#087fb9]/10" : 
                  i === 1 ? "bg-[#18bfc5]/10" : 
                  "bg-slate-900/5"
                }`}>
                  {v[0]}
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-3">{v[1]}</h3>
                <p className="text-slate-500 leading-relaxed mb-6 min-h-[100px]">{v[2]}</p>
                <a href="#solutions" className="inline-flex items-center text-sm font-semibold text-[#087fb9] group-hover:text-[#18bfc5] transition-colors">
                  See how it works <span className="ml-1 group-hover:translate-x-1 transition-transform">→</span>
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* What We Deliver */}
      <section id="solutions" className="py-16 lg:py-24 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-[0.9fr_1.1fr] gap-16 items-center">
          <div>
            <span className="text-xs font-bold text-[#18bfc5] tracking-widest uppercase mb-4 block">What We Deliver</span>
            <h2 className="text-4xl lg:text-5xl font-semibold tracking-tight text-slate-900 leading-tight mb-10">
              Everything your business needs,<br />
              <span className="text-slate-400">unified in a single layer.</span>
            </h2>
            
            <div className="flex flex-wrap gap-2 mb-10">
              {deliverables.map((d, i) => (
                <button 
                  key={d[0]} 
                  onClick={() => setFlow(i)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${flow === i ? "bg-slate-900 text-white shadow-md" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
                >
                  0{i + 1} {d[0]}
                </button>
              ))}
            </div>
            
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#087fb9]" />
              <span className="text-xs font-bold text-[#087fb9] tracking-wider uppercase mb-2 block">{deliverables[flow][0]}</span>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">{deliverables[flow][1]}</h3>
              <p className="text-slate-500 leading-relaxed min-h-[80px]">{deliverables[flow][2]}</p>
            </div>
          </div>
          
          <div className="bg-white rounded-3xl border border-slate-200 p-8 lg:p-12 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]">
            <div className="max-w-[280px] mx-auto p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">✉</div>
              <div>
                <span className="block text-sm font-semibold text-slate-900">New customer signal</span>
                <span className="block text-xs text-slate-500">Intent identified via WhatsApp</span>
              </div>
            </div>
            
            <div className="flex justify-center py-6">
              <div className="w-px h-16 bg-gradient-to-b from-slate-200 via-[#18bfc5] to-[#087fb9]" />
            </div>
            
            <div className="max-w-[320px] mx-auto p-6 rounded-2xl border border-slate-200 bg-slate-900 text-white shadow-xl flex flex-col items-center text-center">
              <Mark />
              <span className="text-xs font-semibold text-slate-400 tracking-wider mt-4 mb-1">OmniRelay Engine</span>
              <span className="text-lg font-medium">Understands. Routes. Acts.</span>
            </div>
            
            <div className="flex justify-center py-6">
              <div className="w-px h-16 bg-gradient-to-b from-[#087fb9] to-slate-200" />
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border border-slate-200 bg-white text-center shadow-sm">
                <span className="block text-green-500 font-bold mb-1">✓</span>
                <span className="text-xs font-semibold text-slate-700">Resolved</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white text-center shadow-sm">
                <span className="block text-[#18bfc5] font-bold mb-1">↗</span>
                <span className="text-xs font-semibold text-slate-700">Handoff</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white text-center shadow-sm">
                <span className="block text-[#087fb9] font-bold mb-1">✦</span>
                <span className="text-xs font-semibold text-slate-700">Learned</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What Value We Add (Comparison) */}
      <section id="results" className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold text-[#18bfc5] tracking-widest uppercase mb-4 block">What Value We Add</span>
            <h2 className="text-4xl lg:text-5xl font-semibold tracking-tight text-slate-900 leading-tight mb-6">
              Absolute trust, multi-tenant security,<br />and immediate ROI.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-24">
            <div className="p-8 lg:p-10 rounded-3xl bg-slate-50 border border-slate-200">
              <span className="inline-block px-3 py-1 rounded-full bg-slate-200/50 text-slate-600 text-xs font-bold tracking-wider mb-6">LEGACY CHATBOTS</span>
              <ul className="space-y-6">
                <li className="flex gap-4">
                  <span className="text-slate-400 mt-1">✕</span>
                  <p className="text-slate-600">Rigid, hardcoded flows that break easily</p>
                </li>
                <li className="flex gap-4">
                  <span className="text-slate-400 mt-1">✕</span>
                  <p className="text-slate-600">Built for a single generic industry use case</p>
                </li>
                <li className="flex gap-4">
                  <span className="text-slate-400 mt-1">✕</span>
                  <p className="text-slate-600">Days of technical setup and manual webhook routing</p>
                </li>
                <li className="flex gap-4">
                  <span className="text-slate-400 mt-1">✕</span>
                  <p className="text-slate-600">Shady data sharing across mixed servers</p>
                </li>
              </ul>
            </div>

            <div className="p-8 lg:p-10 rounded-3xl bg-slate-900 text-white shadow-xl relative overflow-hidden border border-slate-800">
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-bl from-[#087fb9]/30 to-transparent blur-3xl rounded-full opacity-50 -translate-y-1/2 translate-x-1/4" />
              
              <span className="relative z-10 inline-block px-3 py-1 rounded-full bg-[#087fb9]/20 text-[#18bfc5] text-xs font-bold tracking-wider mb-6 border border-[#087fb9]/30">OMNIRELAY ENGINE</span>
              <ul className="space-y-6 relative z-10">
                <li className="flex gap-4">
                  <span className="text-[#18bfc5] mt-1 font-bold">✓</span>
                  <p className="text-slate-300">Dynamic, RAG-grounded intelligence trained on your actual data</p>
                </li>
                <li className="flex gap-4">
                  <span className="text-[#18bfc5] mt-1 font-bold">✓</span>
                  <p className="text-slate-300">Modular system prompts and guardrails tuned specifically for clinics, restaurants, or retail</p>
                </li>
                <li className="flex gap-4">
                  <span className="text-[#18bfc5] mt-1 font-bold">✓</span>
                  <p className="text-slate-300">Live in minutes via secure, automated document ingestion</p>
                </li>
                <li className="flex gap-4">
                  <span className="text-[#18bfc5] mt-1 font-bold">✓</span>
                  <p className="text-slate-300">Strict, tenant-scoped Supabase vector isolation</p>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-16 bg-slate-50 border-y border-slate-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="w-16 h-16 mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center mb-8">
            <span className="text-2xl">🔒</span>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 mb-6">Enterprise-Grade Security & Privacy</h2>
          <p className="text-lg text-slate-500 leading-relaxed">
            Your business data belongs to you—and only you. OmniRelay enforces absolute tenant partitioning, zero-retention metadata logging, and complete alignment with data privacy standards. <strong>Your data never trains public models.</strong>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section id="demo" className="py-16 lg:py-24 px-6">
        <div className="max-w-7xl mx-auto rounded-3xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 p-8 lg:p-12 grid lg:grid-cols-[auto_1fr_auto] gap-10 items-center shadow-sm">
          <div className="hidden lg:block scale-125 transform">
            <Mark />
          </div>
          <div>
            <span className="text-xs font-bold text-[#087fb9] tracking-widest uppercase mb-3 block">Start automating today</span>
            <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 mb-3">
              Ready to modernize your<br />
              <span className="text-slate-500">customer operations?</span>
            </h2>
          </div>
          <div className="flex flex-col gap-4 w-full lg:w-auto items-start">
            <a href="mailto:hello@omnirelay.ai" className="w-full inline-flex items-center justify-center px-8 h-12 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5">
              Get Started in 5 Minutes
            </a>
            <p className="text-sm text-slate-500 max-w-[250px] text-center lg:text-left">
              Deploy your secure WhatsApp sales agent across your clinics, restaurants, or retail branches.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          <div className="flex flex-col gap-4">
            <Logo />
            <p className="text-sm text-slate-500 leading-relaxed max-w-[240px]">
              The AI business operating system built for infinite momentum.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <span className="text-xs font-bold text-slate-900 tracking-wider">PLATFORM</span>
            <a href="#platform" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">Overview</a>
            <a href="#solutions" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">Conversations</a>
            <a href="#solutions" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">Automation</a>
          </div>
          <div className="flex flex-col gap-4">
            <span className="text-xs font-bold text-slate-900 tracking-wider">COMPANY</span>
            <a href="/about" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">About us</a>
            <a href="#impact" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">Aariv Impact Fund</a>
            <a href="#demo" className="text-sm text-slate-500 hover:text-[#087fb9] transition-colors">Contact</a>
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
