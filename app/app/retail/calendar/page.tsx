"use client";

import { useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Clapperboard, Layers, PlaySquare, Rocket, Sparkles } from "lucide-react";
import Link from "next/link";
import { scheduleContent, deployContent } from "./actions";

// The Strategy Guidance Engine
const weekStrategy = [
  { day: "Monday", format: "reel", goal: "reach", icon: Clapperboard, title: "Reel for Reach", desc: "Top of funnel. Attract fresh eyes to your brand." },
  { day: "Tuesday", format: "story", goal: "retention", icon: PlaySquare, title: "Story for Retention", desc: "Keep your existing community engaged daily." },
  { day: "Wednesday", format: "carousel", goal: "depth", icon: Layers, title: "Carousel for Depth", desc: "Turn casual scrollers into true fans." },
  { day: "Thursday", format: "story", goal: "retention", icon: PlaySquare, title: "Story for Retention", desc: "Share behind the scenes or processes." },
  { day: "Friday", format: "reel", goal: "reach", icon: Clapperboard, title: "Reel for Reach", desc: "End the week with a strong hook to capture new traffic." },
];

export default function CalendarPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<Record<string, boolean>>({});
  const [published, setPublished] = useState<Record<string, boolean>>({});

  async function handleSchedule(day: string, format: string, goal: string) {
    setBusy(day);
    // Use the next coming date for the specific day
    const d = new Date();
    d.setDate(d.getDate() + (["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(day) + 7 - d.getDay()) % 7);
    const dateStr = d.toISOString().split('T')[0];
    
    await scheduleContent(dateStr, format, goal);
    setScheduled({ ...scheduled, [day]: true });
    setBusy(null);
  }

  async function handleDeploy(day: string) {
    setBusy(`deploy_${day}`);
    // Fake ID for the UI
    await deployContent(`dummy_id_${day}`);
    setPublished({ ...published, [day]: true });
    setBusy(null);
  }

  return (
    <main className="mx-auto max-w-7xl p-6 pb-24">
      <header className="mb-8">
        <Link href="/app/retail" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 mb-4 transition-colors">
          <ArrowLeft size={16} /> Back to Retail
        </Link>
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-indigo-100 text-indigo-600">
            <CalendarDays size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Organic Content Calendar</h1>
            <p className="text-slate-500">The guided strategy to grow your profile faster.</p>
          </div>
        </div>
      </header>

      <section className="mb-8 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6">
        <div className="flex items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-indigo-600 text-white">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">The AI Content Strategy</h2>
            <p className="mt-1 text-slate-600">
              Data shows creators who balance reach with depth build stronger audiences faster. This calendar pre-fills the optimal strategy: <b>Reels</b> for fresh eyes, <b>Carousels</b> to turn scrollers into fans, and <b>Stories</b> to keep your community engaged.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {weekStrategy.map((item) => (
          <article key={item.day} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
            <header className="border-b border-border bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <b className="text-sm uppercase tracking-wider text-slate-500">{item.day}</b>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
                  item.goal === "reach" ? "bg-amber-100 text-amber-700" :
                  item.goal === "depth" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                }`}>
                  {item.goal}
                </span>
              </div>
            </header>
            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-center gap-3">
                <item.icon size={24} className="text-slate-400" />
                <h3 className="font-bold text-slate-900">{item.title}</h3>
              </div>
              <p className="mt-2 text-sm text-slate-500">{item.desc}</p>
              
              <div className="mt-auto pt-6">
                {published[item.day] ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-2.5 text-sm font-bold text-emerald-700">
                    <CheckCircle2 size={18} /> Published to Meta
                  </div>
                ) : scheduled[item.day] ? (
                  <div className="flex gap-2">
                    <button className="flex-1 rounded-xl border border-border bg-white py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                      View Asset
                    </button>
                    <button 
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                      onClick={() => handleDeploy(item.day)}
                      disabled={busy === `deploy_${item.day}`}
                    >
                      {busy === `deploy_${item.day}` ? "Deploying..." : <><Rocket size={16} /> Deploy</>}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Link href="/app/retail/creative" className="flex-1 text-center rounded-xl border border-border bg-white py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                      Generate Asset
                    </Link>
                    <button 
                      className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
                      onClick={() => handleSchedule(item.day, item.format, item.goal)}
                      disabled={busy === item.day}
                    >
                      {busy === item.day ? "Scheduling..." : "Schedule"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
