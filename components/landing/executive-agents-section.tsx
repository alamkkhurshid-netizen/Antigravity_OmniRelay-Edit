import { UserCheck, Zap, BrainCircuit, Building2 } from "lucide-react";

export function ExecutiveAgentsSection() {
  const agents = [
    {
      icon: UserCheck,
      title: "Support Lead AI",
      desc: "Autonomously resolves complex patient and customer inquiries via WhatsApp using your exact business knowledge base.",
      badge: "Included in PRO",
      accent: "indigo",
      iconBg: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
      hoverBorder: "hover:from-indigo-500/50 hover:to-purple-500/10",
      textAccent: "text-indigo-400",
      shadow: "shadow-[0_0_20px_rgba(99,102,241,0.2)]",
    },
    {
      icon: Zap,
      title: "Super CTO",
      desc: "Your AI engineering team. Automatically monitors API errors and writes patches to keep your integrations running flawlessly.",
      badge: "Included in PRO",
      accent: "emerald",
      iconBg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      hoverBorder: "hover:from-emerald-500/50 hover:to-teal-500/10",
      textAccent: "text-emerald-400",
      shadow: "shadow-[0_0_20px_rgba(16,185,129,0.2)]",
    },
    {
      icon: BrainCircuit,
      title: "Growth Officer",
      desc: "Analyzes your weekly traffic, conversations, and drop-offs to deliver actionable business strategy briefs directly to you.",
      badge: "Included in PRO",
      accent: "rose",
      iconBg: "bg-rose-500/20 text-rose-400 border-rose-500/30",
      hoverBorder: "hover:from-rose-500/50 hover:to-orange-500/10",
      textAccent: "text-rose-400",
      shadow: "shadow-[0_0_20px_rgba(244,63,94,0.2)]",
    },
    {
      icon: Building2,
      title: "Admin Agent",
      desc: "The ultimate manager. Streamlines operations, manages permissions, and automates back-office administrative tasks quietly in the background.",
      badge: "Included in PRO",
      accent: "sky",
      iconBg: "bg-sky-500/20 text-sky-400 border-sky-500/30",
      hoverBorder: "hover:from-sky-500/50 hover:to-blue-500/10",
      textAccent: "text-sky-400",
      shadow: "shadow-[0_0_20px_rgba(14,165,233,0.2)]",
    },
  ];

  return (
    <section id="agents" className="py-16 lg:py-24 relative overflow-hidden bg-slate-900 text-white">
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
            Every OmniRelay workspace can be upgraded with our four proprietary, vertical-specific AI agents. They don&apos;t just answer questions—they actively engineer, manage, and grow your business 24/7.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {agents.map((agent) => {
            const Icon = agent.icon;
            return (
              <div
                key={agent.title}
                className={`group relative rounded-3xl p-px bg-gradient-to-b from-white/10 to-white/0 ${agent.hoverBorder} transition-all duration-500`}
              >
                <div className="h-full rounded-[23px] bg-slate-900/80 backdrop-blur-xl border border-white/5 p-6 flex flex-col items-start transition-all duration-500 group-hover:bg-slate-900/40">
                  <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 ${agent.iconBg} ${agent.shadow}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{agent.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed mb-6">
                    {agent.desc}
                  </p>
                  <div className={`mt-auto w-full pt-4 border-t border-white/10 flex items-center justify-between text-xs font-semibold ${agent.textAccent}`}>
                    <span>{agent.badge}</span>
                    <span className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                      →
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
