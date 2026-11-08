/**
 * OmniRelay AI Operations & Operational Insights Engine
 * S9-05: Anomaly detection, booking drop-off alerts, capacity recommendations with evidence and confidence scores
 * Strict Zero-PHI compliant.
 */

export interface OperationalInsightItem {
  id: string;
  category: "anomaly" | "drop_off" | "capacity" | "efficiency";
  severity: "critical" | "warning" | "opportunity" | "info";
  title: string;
  evidence: string;
  confidenceScore: number; // 0.0 - 1.0
  recommendedAction: string;
  accountableRole: "Reception lead" | "Clinic manager" | "Workspace admin";
  estimatedImpactPaise?: number;
}

export interface StructuredAiInsightsResult {
  generatedAt: string;
  executiveSummary: string;
  anomalies: OperationalInsightItem[];
  dropOffAlerts: OperationalInsightItem[];
  capacityRecommendations: OperationalInsightItem[];
  aggregateConfidenceScore: number;
}

/**
 * Deterministic Anomaly Detection Engine
 */
export function detectAnomalies(metrics: {
  noShowRate: number;
  confirmedBookings: number;
  avgWaitMinutes: number;
  longWaitCount: number;
  deliveryRate: number;
  cancellationRate: number;
}): OperationalInsightItem[] {
  const anomalies: OperationalInsightItem[] = [];

  // Anomaly 1: Severe No-Show Anomaly
  if (metrics.noShowRate > 15 && metrics.confirmedBookings >= 5) {
    anomalies.push({
      id: "ANOMALY_NO_SHOW_SPIKE",
      category: "anomaly",
      severity: "warning",
      title: "Elevated Patient No-Show Anomaly",
      evidence: `Observed ${metrics.noShowRate}% no-show rate across ${metrics.confirmedBookings} confirmed visits (baseline threshold is ≤ 10%).`,
      confidenceScore: 0.92,
      recommendedAction: "Activate 2-hour interactive WhatsApp pre-visit confirmation prompts to recover unconfirmed slots.",
      accountableRole: "Clinic manager",
      estimatedImpactPaise: 450000, // ₹4,500 estimated lost consultation revenue
    });
  }

  // Anomaly 2: Waiting Room Pacing Anomaly
  if (metrics.avgWaitMinutes > 20 || metrics.longWaitCount > 2) {
    anomalies.push({
      id: "ANOMALY_WAIT_TIME_SLA",
      category: "anomaly",
      severity: "critical",
      title: "Queue Delay & Wait Time Bottleneck",
      evidence: `Average queue wait time reached ${metrics.avgWaitMinutes}m with ${metrics.longWaitCount} patients waiting >20 minutes.`,
      confidenceScore: 0.95,
      recommendedAction: "Pace reception token call-ins and alert doctor chambers when intake exceeds 3 waiting patients.",
      accountableRole: "Reception lead",
    });
  }

  // Anomaly 3: WhatsApp Telemetry Drop
  if (metrics.deliveryRate < 90 && metrics.confirmedBookings >= 3) {
    anomalies.push({
      id: "ANOMALY_WHATSAPP_DELIVERY_DROP",
      category: "anomaly",
      severity: "warning",
      title: "WhatsApp Delivery Latency Dip",
      evidence: `Delivery rate dropped to ${metrics.deliveryRate}% (normal target ≥ 96%).`,
      confidenceScore: 0.88,
      recommendedAction: "Verify Meta Business Manager status and ensure recipient mobile formats include active country codes.",
      accountableRole: "Workspace admin",
    });
  }

  return anomalies;
}

/**
 * Booking Funnel Drop-off Analyzer
 */
export function detectBookingDropOffs(funnel: {
  booked: number;
  confirmed: number;
  arrived: number;
  completed: number;
  cancellationRate: number;
}): OperationalInsightItem[] {
  const dropOffs: OperationalInsightItem[] = [];

  if (funnel.booked === 0) return dropOffs;

  const confirmationLoss = funnel.booked - funnel.confirmed;
  if (confirmationLoss > 0 && (confirmationLoss / funnel.booked) > 0.25) {
    const lossPct = Math.round((confirmationLoss / funnel.booked) * 100);
    dropOffs.push({
      id: "DROPOFF_PRE_CONFIRMATION",
      category: "drop_off",
      severity: "warning",
      title: "Pre-Booking Confirmation Drop-Off",
      evidence: `${confirmationLoss} of ${funnel.booked} booking inquiries (${lossPct}%) dropped off before final confirmation.`,
      confidenceScore: 0.89,
      recommendedAction: "Streamline WhatsApp slot selection from 3 steps to 1-click quick-confirm buttons.",
      accountableRole: "Clinic manager",
      estimatedImpactPaise: confirmationLoss * 50000, // ₹500 per consultation
    });
  }

  const arrivalLoss = funnel.confirmed - funnel.arrived;
  if (arrivalLoss > 0 && (arrivalLoss / Math.max(funnel.confirmed, 1)) > 0.15) {
    const lossPct = Math.round((arrivalLoss / funnel.confirmed) * 100);
    dropOffs.push({
      id: "DROPOFF_ARRIVAL_CONVERSION",
      category: "drop_off",
      severity: "warning",
      title: "Confirmed-to-Arrival Drop-Off",
      evidence: `${arrivalLoss} confirmed patients (${lossPct}%) failed to arrive at the clinic counter.`,
      confidenceScore: 0.91,
      recommendedAction: "Dispatch Google Maps navigation link and parking guidance in the morning-of reminder.",
      accountableRole: "Reception lead",
    });
  }

  return dropOffs;
}

/**
 * Doctor Capacity & Chamber Scheduling Recommendations
 */
export function generateCapacityRecommendations(params: {
  doctorSummaries?: Array<{
    doctorName: string;
    totalBookings: number;
    completionRate: number;
    avgWaitTimeMinutes: number;
  }>;
  overallUtilizationRate: number;
}): OperationalInsightItem[] {
  const recommendations: OperationalInsightItem[] = [];

  if (params.overallUtilizationRate < 50) {
    recommendations.push({
      id: "CAPACITY_UNDERUTILIZED",
      category: "capacity",
      severity: "opportunity",
      title: "Unutilized Chamber Capacity Opportunity",
      evidence: `Overall doctor capacity utilization is currently ${params.overallUtilizationRate}%. Estimated 12+ idle appointment slots per week.`,
      confidenceScore: 0.85,
      recommendedAction: "Launch an automated WhatsApp wellness check-in campaign for patients overdue for 6-month checkups.",
      accountableRole: "Clinic manager",
      estimatedImpactPaise: 600000,
    });
  } else if (params.overallUtilizationRate > 85) {
    recommendations.push({
      id: "CAPACITY_PEAK_SATURATION",
      category: "capacity",
      severity: "info",
      title: "High Chamber Utilization (Peak Saturation)",
      evidence: `Doctor capacity is operating at ${params.overallUtilizationRate}%. High throughput observed across primary consultation chambers.`,
      confidenceScore: 0.94,
      recommendedAction: "Introduce buffer time of 5 minutes between slots to prevent waiting room overflow during peak 5-8 PM hours.",
      accountableRole: "Clinic manager",
    });
  }

  return recommendations;
}

/**
 * Top-Level Composite AI Insights Analyzer
 */
export function generateStructuredAiInsights(metrics: {
  funnel: {
    booked: number;
    confirmed: number;
    arrived: number;
    completed: number;
    noShow: number;
    cancelled: number;
    completionRate: number;
    noShowRate: number;
    cancellationRate: number;
  };
  queue: {
    avgWaitTimeMinutes: number;
    maxWaitTimeMinutes: number;
    longWaitCount: number;
  };
  automation: {
    deliveryRate: number;
    readRate: number;
    staffHoursSaved: number;
  };
  doctorUtilizationRate?: number;
}): StructuredAiInsightsResult {
  const anomalies = detectAnomalies({
    noShowRate: metrics.funnel.noShowRate,
    confirmedBookings: metrics.funnel.confirmed,
    avgWaitMinutes: metrics.queue.avgWaitTimeMinutes,
    longWaitCount: metrics.queue.longWaitCount,
    deliveryRate: metrics.automation.deliveryRate,
    cancellationRate: metrics.funnel.cancellationRate,
  });

  const dropOffAlerts = detectBookingDropOffs(metrics.funnel);
  const capacityRecommendations = generateCapacityRecommendations({
    overallUtilizationRate: metrics.doctorUtilizationRate || 78,
  });

  const allItems = [...anomalies, ...dropOffAlerts, ...capacityRecommendations];
  const aggregateConfidenceScore =
    allItems.length > 0
      ? Number((allItems.reduce((sum, item) => sum + item.confidenceScore, 0) / allItems.length).toFixed(2))
      : 0.95;

  const executiveSummary =
    `Clinic operational evaluation: ${metrics.funnel.completed} completed visits with ${metrics.funnel.completionRate}% completion rate. ` +
    `Queue waiting time averages ${metrics.queue.avgWaitTimeMinutes}m. ` +
    `WhatsApp automated concierge saved ${metrics.automation.staffHoursSaved} staff hours with ${metrics.automation.deliveryRate}% delivery reliability.`;

  return {
    generatedAt: new Date().toISOString(),
    executiveSummary,
    anomalies,
    dropOffAlerts,
    capacityRecommendations,
    aggregateConfidenceScore,
  };
}
