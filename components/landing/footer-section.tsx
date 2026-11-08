import { Logo } from "./shared";

export function FooterSection() {
  return (
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
  );
}
