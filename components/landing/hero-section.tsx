import { Mark } from "./shared";

export function HeroSection() {
  return (
    <section className="relative pt-24 pb-10 lg:pt-28 lg:pb-12 overflow-hidden">
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
              {["KA", "MR"].map((initials) => (
                <div key={initials} className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-[#087fb9] bg-[#087fb9]/5 ring-1 ring-slate-100">
                  {initials}
                </div>
              ))}
            </div>
            <div className="flex flex-col text-left">
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
              <span className="text-[10px] font-bold text-[#18bfc5] tracking-widest uppercase">Good morning</span>
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
  );
}
