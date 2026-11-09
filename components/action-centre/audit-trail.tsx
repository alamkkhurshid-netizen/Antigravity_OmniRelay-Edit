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
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">AUDIT TRAIL</span>
          <h2 className="text-xs font-bold tracking-tight text-slate-900">Recent deployments</h2>
        </div>
        <Link className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-800 transition" href="/app/activity">
          Full activity log <ArrowUpRight size={13}/>
        </Link>
      </header>
      
      {deployments.length === 0 ? (
        <p className="p-4 text-xs font-medium text-slate-600">No one-click deployment has been run yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {deployments.map(d => (
            <article className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-slate-50/60" key={d.id}>
              <div>
                <b className="block text-xs font-bold text-slate-900">
                  <Clock3 className="mr-1.5 inline size-3.5 text-teal-600"/>
                  {when(d.created_at)}
                </b>
                <span className="mt-0.5 block text-[11px] font-medium text-slate-600">
                  {d.deployed_count} released · {d.automatic_count} automatic · {d.exception_count} retained
                </span>
              </div>
              <em className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold not-italic capitalize text-slate-700">
                {d.status}
              </em>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
