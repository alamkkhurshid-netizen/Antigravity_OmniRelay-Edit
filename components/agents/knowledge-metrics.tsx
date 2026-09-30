"use client";

import { Agent } from "@/app/app/agents/types";

interface KnowledgeMetricsProps {
  documentsCount: number;
  approved: number;
  pending: number;
  activeAgent?: Agent;
}

export function KnowledgeMetrics({
  documentsCount, approved, pending, activeAgent
}: KnowledgeMetricsProps) {
  return (
    <section className="knowledge-metrics">
      <article><span>Knowledge items</span><b>{documentsCount}</b><small>Workspace-owned sources</small></article>
      <article><span>Approved</span><b>{approved}</b><small>Eligible for agent answers</small></article>
      <article><span>Awaiting indexing</span><b>{pending}</b><small>Runs after model connection</small></article>
      <article><span>Agent status</span><b>{activeAgent?.status??"Training"}</b><small>{activeAgent?.name??"Appointment Concierge"}</small></article>
    </section>
  );
}
