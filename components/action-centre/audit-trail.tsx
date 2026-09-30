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
    <section className="overflow-hidden rounded-2xl border border-border bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <span className="text-xs font-black tracking-[.15em] text-primary">AUDIT TRAIL</span>
          <h2 className="mt-2 text-xl font-semibold">Recent deployments</h2>
        </div>
        <Link className="inline-flex items-center gap-1 text-sm font-bold text-primary" href="/app/activity">
          Full activity log <ArrowUpRight size={15}/>
        </Link>
      </header>
      
      {deployments.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">No one-click deployment has been run yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {deployments.map(d => (
            <article className="flex items-center justify-between gap-3 p-4" key={d.id}>
              <div>
                <b className="block text-sm">
                  <Clock3 className="mr-1 inline size-4 text-primary"/>
                  {when(d.created_at)}
                </b>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {d.deployed_count} released · {d.automatic_count} automatic · {d.exception_count} retained
                </span>
              </div>
              <em className="rounded-full bg-muted px-3 py-1 text-xs font-bold not-italic capitalize text-muted-foreground">
                {d.status}
              </em>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
