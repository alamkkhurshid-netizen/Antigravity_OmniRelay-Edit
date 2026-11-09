"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { Deployment } from "@/app/app/action-centre/types";

const when = (value:string) => new Intl.DateTimeFormat("en-IN", { day:"numeric", month:"short", hour:"numeric", minute:"2-digit", timeZone:"Asia/Kolkata" }).format(new Date(value));

interface AuditTrailProps {
  deployments: Deployment[];
}

export function AuditTrail({ deployments }: AuditTrailProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/60 px-6 py-5">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500">AUDIT TRAIL</span>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Recent deployments</h2>
        </div>
        <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-800 transition" href="/app/activity">
          Full activity log <ArrowUpRight size={14}/>
        </Link>
      </header>
      
      {deployments.length === 0 ? (
        <p className="p-6 text-sm font-medium text-slate-500">No one-click deployment has been run yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {deployments.map(d => (
            <article className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-slate-50/70" key={d.id}>
              <div>
                <b className="block text-sm font-bold text-slate-900">
                  <Clock3 className="mr-1.5 inline size-4 text-teal-600"/>
                  {when(d.created_at)}
                </b>
                <span className="mt-1 block text-sm font-medium text-slate-500">
                  {d.deployed_count} released · {d.automatic_count} automatic · {d.exception_count} retained
                </span>
              </div>
              <em className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold not-italic capitalize text-slate-600">
                {d.status}
              </em>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
