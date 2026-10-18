export function CtaSection() {
  return (
    <section id="demo" className="py-10 px-6">
      <div className="max-w-5xl mx-auto rounded-2xl bg-slate-900 p-8 text-center shadow-lg">
        <h2 className="text-2xl font-semibold tracking-tight text-white mb-3">
          Ready to modernize your operations?
        </h2>
        <p className="text-sm text-slate-400 mb-6 max-w-lg mx-auto">
          Deploy your secure WhatsApp sales agent across your clinics, restaurants, or retail branches in 5 minutes.
        </p>
        <a
          href="mailto:hello@omnirelay.ai"
          className="inline-flex items-center justify-center px-6 h-10 rounded-lg bg-white text-slate-900 font-semibold hover:bg-slate-100 transition-all shadow-sm"
        >
          Get Started
        </a>
      </div>
    </section>
  );
}
