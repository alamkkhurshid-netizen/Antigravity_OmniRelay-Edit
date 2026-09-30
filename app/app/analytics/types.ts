export interface AiInsights {
  executiveSummary: string;
  whatHappened: string;
  whyItMatters: string;
  prescribedActions: Array<{
    role: "Reception lead" | "Clinic manager" | "Workspace admin";
    action: string;
    priority: "high" | "medium" | "low";
  }>;
  laborHoursSavedSummary: string;
  source: "gemini" | "rule_engine";
}
