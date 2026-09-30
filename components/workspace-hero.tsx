import Link from "next/link";
import { Sparkles } from "lucide-react";
import React from "react";

interface WorkspaceHeroProps {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  tag?: string;
  action?: React.ReactNode;
}

export function WorkspaceHero({ title, subtitle, tag, action }: WorkspaceHeroProps) {
  return (
    <section className="relative flex flex-col gap-6 overflow-hidden rounded-2xl bg-slate-950 px-6 py-6 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:px-6 isolate">
      {/* Ambient Orbs & Grain */}
      <div className="absolute -top-32 -right-32 h-[30rem] w-[30rem] rounded-full bg-teal-500/20 blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 h-[30rem] w-[30rem] rounded-full bg-blue-600/20 blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none -z-10" />
      
      <div className="z-10 max-w-2xl">
        {tag && (
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-teal-400 ring-1 ring-inset ring-teal-500/20 uppercase">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-500"></span>
            </span>
            {tag}
          </span>
        )}
        <h2 className="mt-4 text-2xl sm:text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-100 to-slate-400 leading-[1.15]">
          {title}
        </h2>
        <p className="mt-4 text-sm sm:text-base text-slate-400 font-medium tracking-wide flex items-center flex-wrap gap-2">
          {subtitle}
        </p>
      </div>
      
      {action && (
        <div className="flex flex-col sm:flex-row items-center gap-3 z-10">
          {action}
        </div>
      )}
    </section>
  );
}
