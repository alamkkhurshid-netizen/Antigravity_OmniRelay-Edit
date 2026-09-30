import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="mx-auto grid max-w-7xl gap-5 pb-12 animate-pulse">
      {/* Skeleton for WorkspaceHero */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 rounded-2xl bg-slate-900 px-6 py-8 shadow-sm">
        <div className="flex flex-col gap-3 flex-1">
          <div className="h-4 w-32 rounded-full bg-slate-800"></div>
          <div className="h-8 w-3/4 max-w-md rounded-lg bg-slate-800"></div>
          <div className="h-4 w-full max-w-2xl rounded-full bg-slate-800 mt-2"></div>
        </div>
        <div className="h-10 w-32 rounded-xl bg-slate-800"></div>
      </div>

      {/* Skeletons for Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col gap-3">
            <div className="h-4 w-24 rounded bg-slate-100"></div>
            <div className="h-8 w-16 rounded-lg bg-slate-100"></div>
            <div className="h-3 w-32 rounded bg-slate-100 mt-1"></div>
          </div>
        ))}
      </div>

      {/* Skeleton for Main Panel */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 mt-2">
        <div className="flex items-center justify-between mb-6">
          <div className="h-6 w-48 rounded bg-slate-100"></div>
          <div className="h-8 w-24 rounded bg-slate-100"></div>
        </div>
        <div className="flex flex-col gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 w-full rounded-lg bg-slate-50 border border-slate-100"></div>
          ))}
        </div>
      </div>
    </div>
  );
}
