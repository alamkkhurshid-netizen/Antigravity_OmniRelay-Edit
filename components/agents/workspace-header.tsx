"use client";

interface WorkspaceHeaderProps {
  indexing: boolean;
  approved: number;
  indexApprovedKnowledge: () => void;
  setShowForm: (val: boolean) => void;
}

export function WorkspaceHeader({
  indexing, approved, indexApprovedKnowledge, setShowForm
}: WorkspaceHeaderProps) {
  return (
    <section className="relative flex flex-col gap-6 overflow-hidden rounded-2xl bg-slate-950 px-6 py-8 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:px-8 isolate mb-6">
      <div className="absolute -top-32 -right-32 h-[30rem] w-[30rem] rounded-full bg-teal-500/20 blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 h-[30rem] w-[30rem] rounded-full bg-blue-600/20 blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none -z-10" />
      
      <div className="z-10 max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-teal-400 ring-1 ring-inset ring-teal-500/20 uppercase">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-500"></span>
          </span>
          RAG KNOWLEDGE WORKSPACE
        </span>
        <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-100 to-slate-400 leading-[1.15]">
          Teach the agent what is true.
        </h2>
        <p className="mt-4 text-sm sm:text-base text-slate-400 font-medium tracking-wide">
          Add only approved clinic information. OmniRelay will use this controlled library for grounded answers, while appointments and prices continue to come directly from the booking system.
        </p>
      </div>
      
      <div className="flex flex-wrap items-center gap-3 z-10">
        <button className="inline-flex min-h-10 items-center justify-center rounded-xl bg-white/10 border border-white/10 px-4 text-[13px] font-bold text-white shadow-sm backdrop-blur-md transition-all hover:bg-white/20" type="button" disabled={indexing||approved===0} onClick={()=>void indexApprovedKnowledge()}>
          {indexing ? "Indexing changed knowledge…" : "Index changed knowledge"}
        </button>
        <button className="inline-flex min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-teal-400 to-blue-500 px-4 text-[13px] font-bold text-slate-950 shadow-[0_0_20px_rgba(45,212,191,0.25)] transition-all hover:from-teal-300 hover:to-blue-400 hover:scale-[1.02]" onClick={()=>setShowForm(true)}>
          + Add knowledge
        </button>
      </div>
    </section>
  );
}
