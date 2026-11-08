import { Stethoscope, Building2, Store } from "lucide-react";

const verticals = [
  { icon: Stethoscope, title: "Clinics & Healthcare", desc: "Automate patient scheduling, FAQs, and visit reminders with strict tenant isolation." },
  { icon: Building2, title: "Restaurants & Hospitality", desc: "Manage reservations and guest communication without tying up front-of-house staff." },
  { icon: Store, title: "Retail & E-commerce", desc: "Instantly answer stock availability, product specs, and order tracking via chat." }
];

export function VerticalsSection() {
  return (
    <>
      {/* Logos Strip */}
      <section className="border-y border-slate-100 bg-white py-4">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 items-center opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
            {["ACME", "NEXORA", "Vertex", "PULSAR", "gridline"].map((logo, i) => (
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
            {verticals.map((v) => {
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
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
