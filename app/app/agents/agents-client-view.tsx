"use client";

import React, { useState } from "react";
import { PhoneCall, BookOpen, Sparkles, Bot } from "lucide-react";
import { VoiceDashboard } from "./voice-dashboard";
import { PremiumUpsell } from "./premium-upsell";
import { KnowledgeWorkspace } from "./knowledge-workspace";

export function AgentsClientView({
  organizationId,
  documents = [],
  agents = [],
  orgInfo,
  voiceLogs = [],
  voiceConfig,
}: {
  organizationId: string;
  documents?: any[];
  agents?: any[];
  orgInfo?: any;
  voiceLogs?: any[];
  voiceConfig?: any;
}) {
  const [activeTab, setActiveTab] = useState<"voice" | "executive" | "knowledge">("voice");

  return (
    <div className="space-y-6">
      {/* Top Level Category Navigation Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Tab 1: Voice AI Telephony (Active by default) */}
          <button
            type="button"
            onClick={() => setActiveTab("voice")}
            className={`inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              activeTab === "voice"
                ? "bg-slate-900 text-white shadow-md dark:bg-slate-100 dark:text-slate-900"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground border"
            }`}
          >
            <PhoneCall className={`h-4 w-4 ${activeTab === "voice" ? "text-emerald-400 dark:text-emerald-600" : "text-muted-foreground"}`} />
            <span>Voice AI Telephony</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                activeTab === "voice"
                  ? "bg-emerald-500/20 text-emerald-400 dark:bg-emerald-500/30 dark:text-emerald-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              2 Agents (Maya &amp; Rohan)
            </span>
          </button>

          {/* Tab 2: Autonomous Executive Suite */}
          <button
            type="button"
            onClick={() => setActiveTab("executive")}
            className={`inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              activeTab === "executive"
                ? "bg-slate-900 text-white shadow-md dark:bg-slate-100 dark:text-slate-900"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground border"
            }`}
          >
            <Bot className={`h-4 w-4 ${activeTab === "executive" ? "text-blue-400 dark:text-blue-600" : "text-muted-foreground"}`} />
            <span>Autonomous Executive Suite</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                activeTab === "executive"
                  ? "bg-blue-500/20 text-blue-400 dark:bg-blue-500/30 dark:text-blue-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              4 Agents (CTO, Growth, Support, Admin)
            </span>
          </button>

          {/* Tab 3: Knowledge Base & RAG Training */}
          <button
            type="button"
            onClick={() => setActiveTab("knowledge")}
            className={`inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              activeTab === "knowledge"
                ? "bg-slate-900 text-white shadow-md dark:bg-slate-100 dark:text-slate-900"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground border"
            }`}
          >
            <BookOpen className={`h-4 w-4 ${activeTab === "knowledge" ? "text-amber-400 dark:text-amber-600" : "text-muted-foreground"}`} />
            <span>RAG Knowledge Base</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                activeTab === "knowledge"
                  ? "bg-amber-500/20 text-amber-400 dark:bg-amber-500/30 dark:text-amber-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {documents?.length || 0} Sources
            </span>
          </button>
        </div>

        {/* Global Cluster Status Indicator */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Multi-modal cluster active</span>
        </div>
      </div>

      {/* Tab 1: Voice AI Telephony Content (Prominent & Top-level) */}
      {activeTab === "voice" && (
        <div className="space-y-4">
          <VoiceDashboard
            organizationId={organizationId}
            callLogs={voiceLogs ?? []}
            initialConfig={voiceConfig}
          />
        </div>
      )}

      {/* Tab 2: Autonomous Executive Suite Content */}
      {activeTab === "executive" && (
        <div className="space-y-4">
          <PremiumUpsell
            supportActive={!!orgInfo?.premium_support_agent_active}
            ctoActive={!!orgInfo?.premium_cto_agent_active}
            growthActive={!!orgInfo?.premium_growth_agent_active}
            adminActive={!!orgInfo?.premium_admin_agent_active}
          />
        </div>
      )}

      {/* Tab 3: Knowledge Base Content */}
      {activeTab === "knowledge" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-muted/30 border text-xs text-muted-foreground flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <span>
                <strong>Unified Agent Grounding:</strong> Knowledge items, doctor schedules, and clinic FAQs uploaded here are instantly indexed and shared across both your <strong>Voice AI Agents (Maya &amp; Rohan)</strong> and <strong>Support Lead AI (WhatsApp)</strong>.
              </span>
            </div>
          </div>
          <KnowledgeWorkspace
            organizationId={organizationId}
            documents={documents ?? []}
            agents={agents ?? []}
          />
        </div>
      )}
    </div>
  );
}
