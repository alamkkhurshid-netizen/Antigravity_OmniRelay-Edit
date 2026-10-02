"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Stethoscope, Building2, Store, BrainCircuit, Search, Zap, UserCheck, CheckCircle2 } from "lucide-react";

const Mark = () => (
  <div className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#087fb9]/10 to-[#18bfc5]/10 border border-[#087fb9]/20 shadow-sm">
    <div className="absolute w-3 h-3 rounded-full border-2 border-[#18bfc5] top-1.5 left-1 opacity-80 mix-blend-multiply" />
    <div className="absolute w-3 h-3 rounded-full border-2 border-[#087fb9] bottom-1.5 right-1 opacity-80 mix-blend-multiply" />
  </div>
);

const Logo = () => (
  <Link href="/" className="flex items-center gap-2 group">
    <div className="relative w-[140px] h-[40px] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/new-logo.png" alt="OmniRelay" className="object-contain w-full h-full mix-blend-multiply" />
    </div>
  </Link>
);

const verticals = [
  { icon: Stethoscope, title: "Clinics & Healthcare", desc: "Automate patient scheduling, FAQs, and visit reminders with strict tenant isolation." },
  { icon: Building2, title: "Restaurants & Hospitality", desc: "Manage reservations and guest communication without tying up front-of-house staff." },
  { icon: Store, title: "Retail & E-commerce", desc: "Instantly answer stock availability, product specs, and order tracking via chat." }
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
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
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
      <section className="relative pt-24 pb-10 lg:pt-28 lg:pb-12 overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-[#087fb9]/5 to-transparent blur-3xl -z-10 pointer-events-none rounded-full opacity-40" />
        
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-8 items-center">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-100 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#18bfc5] animate-pulse" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">The AI Operating Layer</span>
            </div>
            
            <h1 className="text-4xl lg:text-[64px] leading-[1.05] font-semibold tracking-tight text-slate-900 mb-4">
              One system.<br />
              Every conversation.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#087fb9] to-[#18bfc5]">Infinite momentum.</span>
            </h1>
            
            <p className="text-base lg:text-lg text-slate-500 leading-relaxed max-w-xl mb-8">
              Connect your teams, customers and workflows in one intelligent operating system—so your business can respond, decide and grow without limits.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <a href="#demo" className="w-full sm:w-auto inline-flex items-center justify-center px-5 h-10 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-all shadow-sm">
                Book a demo
              </a>
              <a href="#platform" className="w-full sm:w-auto inline-flex items-center justify-center px-5 h-10 rounded-lg bg-white text-slate-700 text-sm font-semibold border border-slate-200 hover:bg-slate-50 transition-all">
                Explore platform
              </a>
            </div>

            <div className="mt-8 flex items-center gap-3">
              <div className="flex -space-x-2">
                {['KA', 'MR'].map((initials, i) => (
                  <div key={initials} className="w-8 h-8 rounded-full bg-white border-2 border-white flex items-center justify-center text-[10px] font-bold text-[#087fb9] bg-[#087fb9]/5 ring-1 ring-slate-100">
                    {initials}
                  </div>
                ))}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-900">98.5% resolution rate</span>
                <span className="text-[10px] text-slate-400">across automated workflows</span>
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
      <section className="border-y border-slate-100 bg-white py-4">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 items-center opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
            {['ACME', 'NEXORA', 'Vertex', 'PULSAR', 'gridline'].map((logo, i) => (
              <span key={i} className="text-sm font-bold tracking-widest uppercase text-slate-500">{logo}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Section */}
      <section id="platform" className="py-10 lg:py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-end mb-8">
            <div>
              <span className="text-[10px] font-bold text-[#087fb9] tracking-widest uppercase mb-2 block">Core Verticals</span>
              <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 leading-tight">
                One Platform. Three Verticals.
              </h2>
            </div>
            <p className="text-slate-500 max-w-sm text-sm leading-relaxed hidden md:block">
              Customized intelligence tailored to how your industry operates.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-4">
            {verticals.map((v, i) => {
              const Icon = v.icon;
              return (
              <article key={v.title} className="group p-6 rounded-2xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 border border-slate-100 text-slate-700 group-hover:text-[#087fb9] group-hover:border-[#087fb9]/20 transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">{v.title}</h3>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed mb-4">{v.desc}</p>
                <a href="#solutions" className="inline-flex items-center text-xs font-semibold text-slate-400 group-hover:text-[#087fb9] transition-colors">
                  Learn more <span className="ml-1 group-hover:translate-x-0.5 transition-transform">→</span>
                </a>
              </article>
            )})}
          </div>
        </div>
      </section>

      {/* What We Deliver */}
      <section id="solutions" className="py-10 lg:py-12 bg-slate-50/50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-center">
          <div>
            <span className="text-[10px] font-bold text-[#087fb9] tracking-widest uppercase mb-2 block">What We Deliver</span>
            <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 leading-tight mb-8">
              Everything you need,<br />
              <span className="text-slate-400">unified in one layer.</span>
            </h2>
            
            <div className="flex flex-wrap gap-2 mb-8">
              {deliverables.map((d, i) => (
                <button 
                  key={d[0]} 
                  onClick={() => setFlow(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${flow === i ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                >
                  {d[0]}
                </button>
              ))}
            </div>
            
            <div className="p-5 rounded-xl bg-white border border-slate-100 shadow-sm relative">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-1 block">0{flow + 1}</span>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">{deliverables[flow][1]}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{deliverables[flow][2]}</p>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="max-w-[240px] mx-auto p-3 rounded-lg border border-slate-100 bg-slate-50 flex items-center gap-3">
              <div className="w-6 h-6 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-400 text-xs">✉</div>
              <div>
                <span className="block text-xs font-semibold text-slate-900">New customer signal</span>
              </div>
            </div>
            
            <div className="flex justify-center py-4">
              <div className="w-px h-10 bg-gradient-to-b from-slate-200 to-[#087fb9]/50" />
            </div>
            
            <div className="max-w-[280px] mx-auto p-4 rounded-xl border border-slate-200 bg-slate-900 text-white shadow-md flex flex-col items-center text-center">
              <Mark />
              <span className="text-[10px] font-semibold text-slate-400 tracking-wider mt-3 mb-0.5">OmniRelay Engine</span>
              <span className="text-sm font-medium">Understands. Routes. Acts.</span>
            </div>
            
            <div className="flex justify-center py-4">
              <div className="w-px h-10 bg-gradient-to-b from-[#087fb9]/50 to-slate-200" />
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <div className="py-2 px-1 rounded-lg border border-slate-100 bg-slate-50 text-center">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mx-auto mb-1" />
                <span className="text-[10px] font-semibold text-slate-600">Resolved</span>
              </div>
              <div className="py-2 px-1 rounded-lg border border-slate-100 bg-slate-50 text-center">
                <UserCheck className="w-3.5 h-3.5 text-[#087fb9] mx-auto mb-1" />
                <span className="text-[10px] font-semibold text-slate-600">Handoff</span>
              </div>
              <div className="py-2 px-1 rounded-lg border border-slate-100 bg-slate-50 text-center">
                <BrainCircuit className="w-3.5 h-3.5 text-[#18bfc5] mx-auto mb-1" />
                <span className="text-[10px] font-semibold text-slate-600">Learned</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Agentic Workflow (Minimal) */}
      <section className="py-10 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">From signal to resolution in seconds.</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative max-w-4xl mx-auto">
            <div className="hidden md:block absolute top-4 left-[10%] right-[10%] h-px bg-slate-100" />
            
            {[
              { icon: BrainCircuit, title: "1. Ingest", desc: "Classifies intent & urgency." },
              { icon: Search, title: "2. Retrieve", desc: "Queries your documents." },
              { icon: Zap, title: "3. Act", desc: "Executes APIs to book." },
              { icon: UserCheck, title: "4. Handoff", desc: "Routes complex needs." }
            ].map((step, i) => {
              const StepIcon = step.icon;
              return (
                <div key={step.title} className="relative z-10 flex flex-col items-center text-center p-2">
                  <div className="w-8 h-8 bg-white border border-slate-100 text-slate-600 rounded-lg flex items-center justify-center mb-3 shadow-sm">
                    <StepIcon className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">{step.title}</h4>
                  <p className="text-[11px] text-slate-500">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* What Value We Add (Comparison) */}
      <section id="results" className="py-10 lg:py-12">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-8">
            <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 leading-tight">
              Absolute trust and immediate ROI.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-6 rounded-2xl bg-white border border-slate-100">
              <span className="inline-block text-[10px] text-slate-400 font-bold tracking-wider mb-4">LEGACY CHATBOTS</span>
              <ul className="space-y-4">
                <li className="flex gap-3 text-sm">
                  <span className="text-slate-300 mt-0.5">✕</span>
                  <p className="text-slate-500">Rigid, hardcoded flows that break easily</p>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="text-slate-300 mt-0.5">✕</span>
                  <p className="text-slate-500">Built for a single generic industry use case</p>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="text-slate-300 mt-0.5">✕</span>
                  <p className="text-slate-500">Days of manual webhook routing setup</p>
                </li>
              </ul>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 text-white shadow-md relative overflow-hidden">
              <span className="relative z-10 inline-block text-[10px] text-[#18bfc5] font-bold tracking-wider mb-4">OMNIRELAY ENGINE</span>
              <ul className="space-y-4 relative z-10">
                <li className="flex gap-3 text-sm">
                  <span className="text-[#18bfc5] mt-0.5 font-bold">✓</span>
                  <p className="text-slate-300">Dynamic, RAG-grounded intelligence</p>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="text-[#18bfc5] mt-0.5 font-bold">✓</span>
                  <p className="text-slate-300">Modular guardrails tuned for your industry</p>
                </li>
                <li className="flex gap-3 text-sm">
                  <span className="text-[#18bfc5] mt-0.5 font-bold">✓</span>
                  <p className="text-slate-300">Strict, tenant-scoped vector isolation</p>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Premium Agents Section */}
      <section id="agents" className="py-16 lg:py-24 relative overflow-hidden bg-slate-900 text-white">
        {/* Animated background elements */}
        <div className="absolute top-1/4 -right-[20%] w-[800px] h-[600px] bg-gradient-to-br from-indigo-600/20 to-purple-600/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-1/4 -left-[20%] w-[600px] h-[600px] bg-gradient-to-tr from-[#087fb9]/20 to-[#18bfc5]/20 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <span className="inline-block py-1 px-3 rounded-full bg-white/10 border border-white/20 text-xs font-semibold tracking-widest text-[#18bfc5] mb-4 uppercase backdrop-blur-md shadow-[0_0_15px_rgba(24,191,197,0.3)]">
              Premium Service
            </span>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight mb-4">
              Your autonomous<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-[#18bfc5] to-[#087fb9]">
                AI executive team.
              </span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-sm md:text-base">
              Every OmniRelay workspace can be upgraded with our four proprietary, vertical-specific AI agents. They don't just answer questions—they actively engineer, manage, and grow your business 24/7.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Support Lead AI */}
            <div className="group relative rounded-3xl p-px bg-gradient-to-b from-white/10 to-white/0 hover:from-indigo-500/50 hover:to-purple-500/10 transition-all duration-500">
              <div className="h-full rounded-[23px] bg-slate-900/80 backdrop-blur-xl border border-white/5 p-6 flex flex-col items-start transition-all duration-500 group-hover:bg-slate-900/40">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-6 group-hover:scale-110 transition-transform duration-500 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Support Lead AI</h3>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                  Autonomously resolves complex patient and customer inquiries via WhatsApp using your exact business knowledge base.
                </p>
                <div className="mt-auto w-full pt-4 border-t border-white/10 flex items-center justify-between text-xs font-semibold text-indigo-400">
                  <span>Included in PRO</span>
                  <span className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">→</span>
                </div>
              </div>
            </div>

            {/* Super CTO */}
            <div className="group relative rounded-3xl p-px bg-gradient-to-b from-white/10 to-white/0 hover:from-emerald-500/50 hover:to-teal-500/10 transition-all duration-500">
              <div className="h-full rounded-[23px] bg-slate-900/80 backdrop-blur-xl border border-white/5 p-6 flex flex-col items-start transition-all duration-500 group-hover:bg-slate-900/40">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-6 group-hover:scale-110 transition-transform duration-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Super CTO</h3>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                  Your AI engineering team. Automatically monitors API errors and writes patches to keep your integrations running flawlessly.
                </p>
                <div className="mt-auto w-full pt-4 border-t border-white/10 flex items-center justify-between text-xs font-semibold text-emerald-400">
                  <span>Included in PRO</span>
                  <span className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">→</span>
                </div>
              </div>
            </div>

            {/* Growth Officer */}
            <div className="group relative rounded-3xl p-px bg-gradient-to-b from-white/10 to-white/0 hover:from-rose-500/50 hover:to-orange-500/10 transition-all duration-500">
              <div className="h-full rounded-[23px] bg-slate-900/80 backdrop-blur-xl border border-white/5 p-6 flex flex-col items-start transition-all duration-500 group-hover:bg-slate-900/40">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-6 group-hover:scale-110 transition-transform duration-500 shadow-[0_0_20px_rgba(244,63,94,0.2)]">
                  <BrainCircuit className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Growth Officer</h3>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                  Analyzes your weekly traffic, conversations, and drop-offs to deliver actionable business strategy briefs directly to you.
                </p>
                <div className="mt-auto w-full pt-4 border-t border-white/10 flex items-center justify-between text-xs font-semibold text-rose-400">
                  <span>Included in PRO</span>
                  <span className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">→</span>
                </div>
              </div>
            </div>

            {/* Admin Agent */}
            <div className="group relative rounded-3xl p-px bg-gradient-to-b from-white/10 to-white/0 hover:from-sky-500/50 hover:to-blue-500/10 transition-all duration-500">
              <div className="h-full rounded-[23px] bg-slate-900/80 backdrop-blur-xl border border-white/5 p-6 flex flex-col items-start transition-all duration-500 group-hover:bg-slate-900/40">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 mb-6 group-hover:scale-110 transition-transform duration-500 shadow-[0_0_20px_rgba(14,165,233,0.2)]">
                  <Building2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Admin Agent</h3>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                  The ultimate manager. Streamlines operations, manages permissions, and automates back-office administrative tasks quietly in the background.
                </p>
                <div className="mt-auto w-full pt-4 border-t border-white/10 flex items-center justify-between text-xs font-semibold text-sky-400">
                  <span>Included in PRO</span>
                  <span className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">→</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-10 bg-slate-50 border-y border-slate-100">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 mb-4">Enterprise-Grade Security & Privacy</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Your business data belongs to you. OmniRelay enforces absolute tenant partitioning, zero-retention metadata logging, and complete alignment with data privacy standards. <strong>Your data never trains public models.</strong>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section id="demo" className="py-10 px-6">
        <div className="max-w-5xl mx-auto rounded-2xl bg-slate-900 p-8 text-center shadow-lg">
          <h2 className="text-2xl font-semibold tracking-tight text-white mb-3">
            Ready to modernize your operations?
          </h2>
          <p className="text-sm text-slate-400 mb-6 max-w-lg mx-auto">
            Deploy your secure WhatsApp sales agent across your clinics, restaurants, or retail branches in 5 minutes.
          </p>
          <a href="mailto:hello@omnirelay.ai" className="inline-flex items-center justify-center px-6 h-10 rounded-lg bg-white text-slate-900 font-semibold hover:bg-slate-100 transition-all shadow-sm">
            Get Started
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white pt-10 pb-6 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <div className="col-span-2 md:col-span-1 flex flex-col gap-3">
            <Logo />
            <p className="text-[11px] text-slate-500 max-w-[200px]">
              The AI business operating system built for infinite momentum.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold text-slate-900 tracking-wider">PLATFORM</span>
            <a href="#platform" className="text-xs text-slate-500 hover:text-[#087fb9]">Overview</a>
            <a href="#solutions" className="text-xs text-slate-500 hover:text-[#087fb9]">Conversations</a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold text-slate-900 tracking-wider">COMPANY</span>
            <a href="/about" className="text-xs text-slate-500 hover:text-[#087fb9]">About us</a>
            <a href="mailto:hello@omnirelay.ai" className="text-xs text-slate-500 hover:text-[#087fb9]">Contact</a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold text-slate-900 tracking-wider">LEGAL</span>
            <a href="/privacy" className="text-xs text-slate-500 hover:text-[#087fb9]">Privacy Policy</a>
            <a href="/terms" className="text-xs text-slate-500 hover:text-[#087fb9]">Terms of Service</a>
          </div>
        </div>
        <div className="max-w-7xl mx-auto border-t border-slate-100 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-xs text-slate-400">© 2026 OmniRelay. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <a href="/privacy" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">Privacy</a>
            <a href="/terms" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
