"use client";

interface CareMetricsProps {
  activeCount: number;
  needsAttention: number;
  failed: number;
  ready: number;
  needsClinicalFollowup: number;
  acknowledged: number;
  delivered: number;
}

export function CareMetrics({
  activeCount, needsAttention, failed, ready, needsClinicalFollowup, acknowledged, delivered
}: CareMetricsProps) {
  return (
    <section className="care-metrics">
      <article><span>Active schedules</span><b>{activeCount}</b><small>Doctor-approved instructions</small></article>
      <article className={needsAttention ? "warning" : ""}><span>Needs attention</span><b>{needsAttention}</b><small>Due, blocked or failed</small></article>
      <article className={failed ? "danger" : ""}><span>Delivery failures</span><b>{failed}</b><small>{ready} waiting for dispatch</small></article>
      <article className={needsClinicalFollowup ? "warning" : ""}><span>Patient responses</span><b>{acknowledged}</b><small>{needsClinicalFollowup ? `${needsClinicalFollowup} need staff follow-up` : `${delivered} delivered or read`}</small></article>
    </section>
  );
}
