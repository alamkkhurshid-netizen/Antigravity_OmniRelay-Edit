"use client";

import { ClinicAnalyticsResult, DoctorResource } from "@/lib/analytics-engine";
import { useAnalyticsWorkspace } from "./use-analytics-workspace";
import { ExecutiveHeader } from "@/components/analytics/executive-header";
import { AiCopilotBanner } from "@/components/analytics/ai-copilot-banner";
import { KpiMetricCards } from "@/components/analytics/kpi-metric-cards";
import { FunnelAndAutomation } from "@/components/analytics/funnel-and-automation";
import { DoctorPerformanceMatrix } from "@/components/analytics/doctor-performance-matrix";
import { CareAndAlerts } from "@/components/analytics/care-and-alerts";

export function AnalyticsWorkspace({
  initialAnalytics,
  initialAiPayload,
  clinicName,
  doctors,
  organizationId,
  initialWhatsappCounts,
}: {
  initialAnalytics: ClinicAnalyticsResult;
  initialAiPayload: any;
  clinicName: string;
  doctors: DoctorResource[];
  organizationId: string;
  initialWhatsappCounts: { messages: number; estimatedCostPaise: number };
}) {
  const state = useAnalyticsWorkspace(initialAnalytics, initialAiPayload);

  return (
    <div className="space-y-6 pb-12">
      <ExecutiveHeader
        clinicName={clinicName}
        organizationId={organizationId}
        initialWhatsappCounts={initialWhatsappCounts}
        range={state.range}
        handleRangeChange={state.handleRangeChange}
        selectedDoctor={state.selectedDoctor}
        handleDoctorChange={state.handleDoctorChange}
        doctors={doctors}
        downloadCsv={state.downloadCsv}
      />

      <AiCopilotBanner
        aiInsights={state.aiInsights}
        loadingAi={state.loadingAi}
        isPending={state.isPending}
        fetchAiInsights={state.fetchAiInsights}
        funnel={state.analytics.funnel}
      />

      <KpiMetricCards
        funnel={state.analytics.funnel}
        queue={state.analytics.queueDelays}
        automation={state.analytics.automation}
        fin={state.analytics.financialAndCare}
      />

      <FunnelAndAutomation
        funnel={state.analytics.funnel}
        automation={state.analytics.automation}
      />

      <DoctorPerformanceMatrix
        doctorSummaries={state.analytics.doctorSummaries}
      />

      <CareAndAlerts
        fin={state.analytics.financialAndCare}
        deterministicAlerts={state.analytics.deterministicAlerts}
      />
    </div>
  );
}
