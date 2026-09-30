"use client";

import { KnowledgeDocument, Agent } from "./types";
import { useKnowledgeWorkspace } from "./use-knowledge-workspace";
import { WorkspaceHeader } from "@/components/agents/workspace-header";
import { KnowledgeMetrics } from "@/components/agents/knowledge-metrics";
import { ConciergeControl } from "@/components/agents/concierge-control";
import { AgentGuardrail } from "@/components/agents/agent-guardrail";
import { FaqStarterPack } from "@/components/agents/faq-starter-pack";
import { GroundingLab } from "@/components/agents/grounding-lab";
import { SafetySuite } from "@/components/agents/safety-suite";
import { KnowledgeLibrary } from "@/components/agents/knowledge-library";
import { AddKnowledgeModal, EditKnowledgeModal, AgentSettingsModal } from "@/components/agents/modals";

export function KnowledgeWorkspace({
  organizationId, documents: initialDocuments, agents
}: {
  organizationId: string; documents: KnowledgeDocument[]; agents: Agent[]
}) {
  const state = useKnowledgeWorkspace({ organizationId, documents: initialDocuments, agents });

  return (
    <main className="mx-auto grid max-w-7xl gap-5 pb-12">
      <WorkspaceHeader 
        indexing={state.indexing}
        approved={state.approved}
        indexApprovedKnowledge={state.indexApprovedKnowledge}
        setShowForm={state.setShowForm}
      />

      <KnowledgeMetrics 
        documentsCount={state.documents.length}
        approved={state.approved}
        pending={state.pending}
        activeAgent={state.activeAgent}
      />

      <ConciergeControl 
        activeAgent={state.activeAgent}
        readinessChecks={state.readinessChecks}
        agentReady={state.agentReady}
        setShowAgentSettings={state.setShowAgentSettings}
      />

      <AgentGuardrail />

      <FaqStarterPack 
        approvedFaqs={state.approvedFaqs}
        totalFaqs={state.faqDocuments.length}
        starterRemaining={state.starterRemaining.length}
        busy={state.busy}
        installStarterPack={state.installStarterPack}
      />

      <GroundingLab 
        testQuestion={state.testQuestion}
        setTestQuestion={state.setTestQuestion}
        testing={state.testing}
        preview={state.preview}
        testAgent={state.testAgent}
      />

      <SafetySuite 
        safetyTesting={state.safetyTesting}
        safetyResults={state.safetyResults}
        runSafetySuite={state.runSafetySuite}
      />

      <KnowledgeLibrary 
        rows={state.rows}
        statusFilter={state.statusFilter}
        setStatusFilter={state.setStatusFilter}
        query={state.query}
        setQuery={state.setQuery}
        starterTitles={state.starterTitles}
        setEditing={state.setEditing}
        toggleStatus={state.toggleStatus}
      />

      <AddKnowledgeModal 
        showForm={state.showForm}
        setShowForm={state.setShowForm}
        busy={state.busy}
        addKnowledge={state.addKnowledge}
      />

      <EditKnowledgeModal 
        editing={state.editing}
        setEditing={state.setEditing}
        busy={state.busy}
        saveEdit={state.saveEdit}
      />

      <AgentSettingsModal 
        showAgentSettings={state.showAgentSettings}
        setShowAgentSettings={state.setShowAgentSettings}
        activeAgent={state.activeAgent}
        busy={state.busy}
        saveAgentSettings={state.saveAgentSettings}
      />

      {state.message && <p className="knowledge-message" role="status">{state.message}</p>}
    </main>
  );
}
