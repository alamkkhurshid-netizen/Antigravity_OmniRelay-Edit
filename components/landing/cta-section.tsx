import Link from "next/link";

export function CtaSection() {
  return (
    <section id="demo" className="py-10 px-6">
      <div className="max-w-5xl mx-auto rounded-2xl bg-slate-900 p-8 text-center shadow-lg">
        <h2 className="text-2xl font-semibold tracking-tight text-white mb-3">
          Ready to modernize your operations?
        </h2>
        <p className="text-sm text-slate-400 mb-6 max-w-lg mx-auto">
          Deploy your secure WhatsApp and voice receptionist across your clinics, restaurants, or retail branches in 5 minutes.
        </p>
        <Link
          href="/login?mode=signup"
          className="inline-flex items-center justify-center px-6 h-11 rounded-xl bg-gradient-to-r from-[#087fb9] to-[#18bfc5] text-white text-sm font-semibold hover:opacity-90 transition-all shadow-md hover:-translate-y-0.5"
        >
          Get Started Free
        </Link>
      </div>
    </section>
  );
}
