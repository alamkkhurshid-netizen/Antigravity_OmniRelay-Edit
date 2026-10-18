import { BrainCircuit, Search, Zap, UserCheck } from "lucide-react";

export function AgenticWorkflowSection() {
  const steps = [
    { icon: BrainCircuit, title: "1. Ingest", desc: "Classifies intent & urgency." },
    { icon: Search, title: "2. Retrieve", desc: "Queries your documents." },
    { icon: Zap, title: "3. Act", desc: "Executes APIs to book." },
    { icon: UserCheck, title: "4. Handoff", desc: "Routes complex needs." }
  ];

  return (
    <section className="py-10 bg-white border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            From signal to resolution in seconds.
          </h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative max-w-4xl mx-auto">
          <div className="hidden md:block absolute top-4 left-[10%] right-[10%] h-px bg-slate-100" />
          
          {steps.map((step) => {
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
  );
}
