export function ComparisonSection() {
  return (
    <section id="results" className="py-10 lg:py-12">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-8">
          <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 leading-tight">
            Absolute trust and immediate ROI.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-6 rounded-2xl bg-white border border-slate-100">
            <span className="inline-block text-[10px] text-slate-400 font-bold tracking-wider mb-4">
              LEGACY CHATBOTS
            </span>
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
            <span className="relative z-10 inline-block text-[10px] text-[#18bfc5] font-bold tracking-wider mb-4">
              OMNIRELAY ENGINE
            </span>
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
  );
}
