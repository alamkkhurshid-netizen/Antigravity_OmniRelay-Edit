"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronRight, MessageSquare, Zap, BarChart3, Users, Workflow } from "lucide-react";

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
    <main className="min-h-screen bg-white text-[#02042A] font-sans selection:bg-[#087fb9]/20 selection:text-[#087fb9]">
      
      {/* Navigation - High Density */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Logo />
            <div className="hidden lg:flex items-center gap-6">
              <a href="#platform" className="text-sm font-semibold text-[#02042A] hover:text-[#087fb9] transition-colors">Platform</a>
              <a href="#solutions" className="text-sm font-semibold text-[#02042A] hover:text-[#087fb9] transition-colors">Solutions</a>
              <a href="#results" className="text-sm font-semibold text-[#02042A] hover:text-[#087fb9] transition-colors">Results</a>
            </div>
          </div>

          <div className="flex items-center gap-4 z-50">
            <Link href="/login" className="hidden lg:inline-flex text-sm font-semibold text-[#087fb9] hover:text-[#02042A] transition-colors">
              Log In
            </Link>
            <Link href="/login" className="hidden lg:inline-flex items-center justify-center px-4 h-9 rounded bg-[#087fb9] text-white text-sm font-bold hover:bg-[#066d9c] transition-all shadow-sm">
              Sign Up
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
            <button className="lg:hidden p-2 -mr-2 text-slate-600" onClick={() => setMenu(!menu)} aria-label="Toggle menu">
              <div className="w-5 h-0.5 bg-current mb-1.5" />
              <div className="w-5 h-0.5 bg-current" />
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section - 55/45 Split, Ultra Tight */}
      <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-20 overflow-hidden bg-gradient-to-b from-[#F8F9FA] to-white border-b border-slate-100">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#18bfc5]/10 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
          <div className="z-10">
            <h1 className="text-[40px] md:text-[56px] leading-[1.1] font-extrabold text-[#02042A] tracking-tight mb-5">
              Power your business with <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#087fb9] to-[#18bfc5]">Intelligent Workflows.</span>
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed max-w-xl mb-8 font-medium">
              Accept conversations, route approvals, and automate customer journeys in one seamless operating layer. Build momentum without the busywork.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              <Link href="/login" className="w-full sm:w-auto inline-flex items-center justify-center px-6 h-12 rounded bg-[#087fb9] text-white text-[15px] font-bold hover:bg-[#066d9c] transition-all shadow-[0_4px_14px_rgba(8,127,185,0.3)]">
                Sign Up Now
              </Link>
              <a href="#platform" className="w-full sm:w-auto inline-flex items-center justify-center px-6 h-12 rounded bg-white text-[#087fb9] border border-slate-200 text-[15px] font-bold hover:bg-slate-50 transition-all shadow-sm">
                Explore Platform
              </a>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200/60 flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-xl font-extrabold text-[#02042A]">98.5%</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Auto-Resolved</span>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div className="flex flex-col">
                <span className="text-xl font-extrabold text-[#02042A]">3.2x</span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Faster Action</span>
              </div>
            </div>
          </div>
          
          {/* Dense, edge-hugging UI graphic */}
          <div className="relative w-full h-[400px] lg:h-[500px] lg:-mr-12 xl:-mr-24 z-10">
            <div className="absolute inset-0 bg-white rounded-l-2xl border border-slate-200 shadow-[0_20px_40px_rgba(2,4,42,0.08)] overflow-hidden flex flex-col">
              <div className="h-10 bg-slate-50 border-b border-slate-100 flex items-center px-4 gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="ml-4 text-[10px] font-bold text-slate-400">OMNIRELAY DASHBOARD</span>
              </div>
              
              <div className="flex-1 p-6 flex flex-col gap-4 bg-[#F8F9FA]">
                <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm flex items-start gap-3">
                  <div className="w-8 h-8 rounded bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#02042A]">Lead Qualified: Enterprise Tier</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Automated via RAG Bot · 2 mins ago</p>
                  </div>
                </div>

                <div className="relative pl-6 ml-4 border-l-2 border-slate-200">
                  <div className="absolute -left-[9px] top-2 w-4 h-4 rounded-full bg-white border-2 border-[#18bfc5]" />
                  <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="text-sm font-bold text-[#02042A]">Workflow: Routing to Sales</h4>
                    <p className="text-xs text-slate-500 mt-1">Executing XYFlow #402...</p>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full mt-3 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#087fb9] to-[#18bfc5] w-[60%] animate-pulse" />
                    </div>
                  </div>
                </div>
                
                <div className="mt-auto p-4 bg-gradient-to-r from-[#02042A] to-[#0A1A3A] rounded-lg shadow-md text-white flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-[#18bfc5] uppercase tracking-wider">Live Metrics</span>
                    <div className="text-xl font-extrabold mt-0.5">12,540</div>
                  </div>
                  <BarChart3 className="w-6 h-6 text-[#087fb9]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Ribbon - Tight */}
      <section className="bg-white py-6 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Powering disruptors</span>
          <div className="flex flex-wrap justify-center md:justify-end gap-8 md:gap-12 grayscale opacity-50">
            {['ACME CORP', 'NEXORA', 'VERTEX', 'PULSAR', 'GRIDLINE'].map((logo, i) => (
              <span key={i} className="text-sm font-extrabold tracking-tight text-[#02042A]">{logo}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Bento Grid - High Density */}
      <section id="platform" className="py-20 bg-[#F8F9FA]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#02042A] mb-4">
              A single platform for <span className="text-[#087fb9]">unified operations.</span>
            </h2>
            <p className="text-slate-600 font-medium">
              Replace disconnected tools with one intelligent layer built to understand, coordinate, and act across your entire business instantly.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Large Card 1 */}
            <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-8 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 w-64 h-64 bg-gradient-to-tl from-[#087fb9]/5 to-transparent rounded-tl-full pointer-events-none" />
              <div className="w-12 h-12 bg-[#087fb9]/10 rounded flex items-center justify-center text-[#087fb9] mb-6">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-[#02042A] mb-2">AI Conversations</h3>
              <p className="text-sm text-slate-600 max-w-sm mb-6">Turn every customer interaction into a fast, personal response across every channel via Semantic RAG.</p>
              <a href="#" className="inline-flex items-center text-[13px] font-bold text-[#087fb9] group-hover:text-[#18bfc5] transition-colors">
                Explore Conversations <ChevronRight className="w-4 h-4 ml-1" />
              </a>
            </div>

            {/* Small Card 1 */}
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-[#18bfc5]/10 rounded flex items-center justify-center text-[#18bfc5] mb-6">
                <Workflow className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-[#02042A] mb-2">XYFlow Automation</h3>
              <p className="text-sm text-slate-600 mb-6">Connect decisions to action with intelligent workflows that move work forward automatically.</p>
            </div>

            {/* Small Card 2 */}
            <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-indigo-50 rounded flex items-center justify-center text-indigo-600 mb-6">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-[#02042A] mb-2">Team Handoffs</h3>
              <p className="text-sm text-slate-600 mb-6">Seamless escalation from AI to human agents with full conversational context.</p>
            </div>

            {/* Large Card 2 */}
            <div className="md:col-span-2 bg-[#02042A] rounded-xl border border-transparent p-8 shadow-md relative overflow-hidden group">
              <div className="absolute right-0 top-0 w-64 h-64 bg-gradient-to-bl from-[#18bfc5]/20 to-transparent rounded-bl-full pointer-events-none" />
              <div className="w-12 h-12 bg-white/10 rounded flex items-center justify-center text-[#18bfc5] mb-6">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Unified Intelligence</h3>
              <p className="text-sm text-slate-300 max-w-sm mb-6">Bring your teams, data and systems into one clear operating view, ready for every next move.</p>
              <a href="#" className="inline-flex items-center text-[13px] font-bold text-[#18bfc5] group-hover:text-white transition-colors">
                View Dashboards <ChevronRight className="w-4 h-4 ml-1" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Deep Navy Results Section - Compact */}
      <section id="results" className="py-20 bg-[#02042A] text-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 border-b border-slate-800 pb-12 mb-12">
            <div className="max-w-md">
              <span className="text-[11px] font-bold text-[#18bfc5] tracking-widest uppercase mb-3 block">The OmniRelay Effect</span>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Less busywork.<br />More momentum.
              </h2>
            </div>
            <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
              Companies running on OmniRelay see immediate improvements in resolution times and team capacity.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-slate-800">
            <div className="pt-6 md:pt-0">
              <div className="text-5xl font-extrabold tracking-tight mb-2 text-[#18bfc5]">98.5%</div>
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Conversations resolved</div>
            </div>
            <div className="pt-6 md:pt-0 md:pl-8">
              <div className="text-5xl font-extrabold tracking-tight mb-2 text-white">64%</div>
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Less repetitive work</div>
            </div>
            <div className="pt-6 md:pt-0 md:pl-8">
              <div className="text-5xl font-extrabold tracking-tight mb-2 text-white">3.2×</div>
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Faster action</div>
            </div>
          </div>
        </div>
      </section>

      {/* Dense Footer */}
      <footer className="bg-[#F8F9FA] pt-16 pb-8 px-6 border-t border-slate-200">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 mb-16">
          <div className="col-span-2 lg:col-span-2">
            <Logo />
            <p className="mt-4 text-xs text-slate-500 leading-relaxed max-w-xs font-medium">
              The AI business operating system built for infinite momentum. Accept, route, and automate flawlessly.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-slate-200" />
              <div className="w-8 h-8 rounded bg-slate-200" />
              <div className="w-8 h-8 rounded bg-slate-200" />
            </div>
          </div>
          
          <div>
            <span className="text-[11px] font-bold text-[#02042A] tracking-widest uppercase mb-4 block">Platform</span>
            <ul className="space-y-3">
              <li><a href="#" className="text-sm text-slate-600 hover:text-[#087fb9] font-medium">Conversations</a></li>
              <li><a href="#" className="text-sm text-slate-600 hover:text-[#087fb9] font-medium">Automation</a></li>
              <li><a href="#" className="text-sm text-slate-600 hover:text-[#087fb9] font-medium">Intelligence</a></li>
              <li><a href="#" className="text-sm text-slate-600 hover:text-[#087fb9] font-medium">Integrations</a></li>
            </ul>
          </div>
          
          <div>
            <span className="text-[11px] font-bold text-[#02042A] tracking-widest uppercase mb-4 block">Company</span>
            <ul className="space-y-3">
              <li><a href="#" className="text-sm text-slate-600 hover:text-[#087fb9] font-medium">About Us</a></li>
              <li><a href="#" className="text-sm text-slate-600 hover:text-[#087fb9] font-medium">Careers</a></li>
              <li><a href="#" className="text-sm text-slate-600 hover:text-[#087fb9] font-medium">Blog</a></li>
              <li><a href="#" className="text-sm text-slate-600 hover:text-[#087fb9] font-medium">Contact</a></li>
            </ul>
          </div>
          
          <div>
            <span className="text-[11px] font-bold text-[#02042A] tracking-widest uppercase mb-4 block">Legal</span>
            <ul className="space-y-3">
              <li><a href="/terms" className="text-sm text-slate-600 hover:text-[#087fb9] font-medium">Terms</a></li>
              <li><a href="/privacy" className="text-sm text-slate-600 hover:text-[#087fb9] font-medium">Privacy</a></li>
              <li><a href="/security" className="text-sm text-slate-600 hover:text-[#087fb9] font-medium">Security</a></li>
            </ul>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto pt-8 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-xs font-semibold text-slate-500">© 2026 OmniRelay. All rights reserved.</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">All systems operational</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
