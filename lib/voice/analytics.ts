export interface VoiceCallLog {
  id: string;
  org_id: string;
  contact_phone: string;
  direction: "inbound" | "outbound";
  duration_seconds: number;
  outcome: string;
  emergency_flag: boolean;
  latency_metrics?: {
    llm_first_chunk_ms?: number;
    tts_first_chunk_ms?: number;
    e2e_turn_ms?: number;
  };
  created_at: string;
}

export interface VoiceAnalyticsKPIs {
  totalCalls: number;
  totalTalkTimeSeconds: number;
  totalBillableMinutes: number;
  avgDurationSeconds: number;
  bookingCount: number;
  conversionRatePercent: number;
  transferredCount: number;
  emergencyCount: number;
  avgLatencyMs: number;
  hourlyVolume: number[]; // 24 hours
  outcomeCounts: Record<string, number>;
}

/**
 * Computes production voice analytics KPIs from an array of call logs
 */
export function computeVoiceAnalytics(logs: VoiceCallLog[]): VoiceAnalyticsKPIs {
  const totalCalls = logs.length;
  if (totalCalls === 0) {
    return {
      totalCalls: 0,
      totalTalkTimeSeconds: 0,
      totalBillableMinutes: 0,
      avgDurationSeconds: 0,
      bookingCount: 0,
      conversionRatePercent: 0,
      transferredCount: 0,
      emergencyCount: 0,
      avgLatencyMs: 0,
      hourlyVolume: new Array(24).fill(0),
      outcomeCounts: {},
    };
  }

  let totalTalkTimeSeconds = 0;
  let bookingCount = 0;
  let transferredCount = 0;
  let emergencyCount = 0;
  let latencySum = 0;
  let latencySampleCount = 0;

  const hourlyVolume = new Array(24).fill(0);
  const outcomeCounts: Record<string, number> = {};

  for (const log of logs) {
    const duration = log.duration_seconds || 0;
    totalTalkTimeSeconds += duration;

    // Outomes
    const outcome = log.outcome || "unspecified";
    outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;

    if (outcome === "appointment_booked") bookingCount++;
    if (outcome === "human_transferred") transferredCount++;
    if (log.emergency_flag || outcome === "emergency_escalated") emergencyCount++;

    // Hourly distribution
    const hour = new Date(log.created_at).getHours();
    if (hour >= 0 && hour < 24) {
      hourlyVolume[hour]++;
    }

    // Latency
    if (log.latency_metrics?.e2e_turn_ms) {
      latencySum += log.latency_metrics.e2e_turn_ms;
      latencySampleCount++;
    }
  }

  const avgDurationSeconds = Math.round(totalTalkTimeSeconds / totalCalls);
  const totalBillableMinutes = Math.ceil(totalTalkTimeSeconds / 60);
  const conversionRatePercent = Math.round((bookingCount / totalCalls) * 100);
  const avgLatencyMs = latencySampleCount > 0 ? Math.round(latencySum / latencySampleCount) : 480;

  return {
    totalCalls,
    totalTalkTimeSeconds,
    totalBillableMinutes,
    avgDurationSeconds,
    bookingCount,
    conversionRatePercent,
    transferredCount,
    emergencyCount,
    avgLatencyMs,
    hourlyVolume,
    outcomeCounts,
  };
}
