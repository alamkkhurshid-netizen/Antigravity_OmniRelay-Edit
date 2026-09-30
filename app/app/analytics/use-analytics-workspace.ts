import { useEffect, useState, useTransition } from "react";
import { ClinicAnalyticsResult, DateRangeKey } from "@/lib/analytics-engine";
import { AiInsights } from "./types";

export function useAnalyticsWorkspace(
  initialAnalytics: ClinicAnalyticsResult,
  initialAiPayload: any
) {
  const [range, setRange] = useState<DateRangeKey>(initialAnalytics.range || "7d");
  const [selectedDoctor, setSelectedDoctor] = useState<string>("all");
  const [analytics, setAnalytics] = useState<ClinicAnalyticsResult>(initialAnalytics);
  const [aiPayload, setAiPayload] = useState<any>(initialAiPayload);
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function fetchAiInsights(payloadToAnalyze = aiPayload) {
    setLoadingAi(true);
    try {
      const res = await fetch("/api/analytics/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: payloadToAnalyze }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiInsights(data);
      }
    } catch (err) {
      console.error("Failed to fetch AI insights:", err);
    } finally {
      setLoadingAi(false);
    }
  }

  async function reloadAnalytics(newRange = range, newDoc = selectedDoctor) {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/analytics/summary?range=${newRange}&doctorId=${newDoc}`
        );
        if (res.ok) {
          const data = await res.json();
          setAnalytics(data.analytics);
          setAiPayload(data.sanitizedAiPayload);
          fetchAiInsights(data.sanitizedAiPayload);
        }
      } catch (err) {
        console.error("Failed to reload analytics:", err);
      }
    });
  }

  useEffect(() => {
    fetchAiInsights(initialAiPayload);
  }, []);

  function handleRangeChange(newRange: DateRangeKey) {
    setRange(newRange);
    reloadAnalytics(newRange, selectedDoctor);
  }

  function handleDoctorChange(newDoc: string) {
    setSelectedDoctor(newDoc);
    reloadAnalytics(range, newDoc);
  }

  function downloadCsv() {
    window.location.href = `/api/analytics/summary?range=${range}&doctorId=${selectedDoctor}&format=csv`;
  }

  return {
    range,
    setRange,
    selectedDoctor,
    setSelectedDoctor,
    analytics,
    aiPayload,
    aiInsights,
    loadingAi,
    isPending,
    handleRangeChange,
    handleDoctorChange,
    downloadCsv,
    fetchAiInsights
  };
}
