"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  PhoneCall, 
  Activity, 
  Settings, 
  Clock, 
  IndianRupee, 
  PhoneForwarded, 
  Languages, 
  FileText, 
  ChevronDown, 
  ChevronUp,
  Sparkles,
  Smartphone
} from "lucide-react";
import { VoiceSetupWizard } from "./voice-setup-wizard";

interface VoiceCallLog {
  id: string;
  contact_phone: string;
  direction: "inbound" | "outbound";
  duration_seconds: number;
  outcome: string;
  created_at: string;
  cost_inr: number;
  transcript?: any;
  summary?: string;
  emergency_flag?: boolean;
}

export function VoiceDashboard({
  organizationId,
  callLogs = [],
  initialConfig
}: {
  organizationId: string;
  callLogs?: VoiceCallLog[];
  initialConfig?: any;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [isWizardOpen, setIsWizardOpen] = useState(!initialConfig?.onboarding_completed);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const totalMinutes = callLogs.reduce((acc, log) => acc + (log.duration_seconds || 0), 0) / 60;
  const totalCost = callLogs.reduce((acc, log) => acc + (log.cost_inr || 0), 0);

  if (isWizardOpen) {
    return (
      <VoiceSetupWizard
        initialConfig={config}
        organizationId={organizationId}
        onComplete={(updated) => {
          setConfig(updated);
          setIsWizardOpen(false);
        }}
        onCancel={config?.onboarding_completed ? () => setIsWizardOpen(false) : undefined}
      />
    );
  }

  return (
    <div className="space-y-6 mt-8">
      {/* Header with Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">AI Voice Receptionist</h2>
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
              Active on PSTN
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automating patient appointments, triage, and human front-desk escalation.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setIsWizardOpen(true)}
            className="border-emerald-500/40 hover:bg-emerald-500/10"
          >
            <Settings className="h-4 w-4 mr-1.5 text-emerald-500" />
            Configure Bot Settings
          </Button>
        </div>
      </div>

      {/* Active Voice Line Summary Banner */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                {config?.telephony_mode === "dedicated_vmn" ? "Dedicated Mobile Line (VMN)" : "Active Telephony Line"}
              </span>
              <span className="text-lg font-mono font-bold text-foreground">
                {config?.telephony_mode === "dedicated_vmn" 
                  ? (config?.vmn_number || "+91 98450 24001") 
                  : (config?.virtual_number || "08047283676")}
              </span>
              <span className="text-xs text-muted-foreground block mt-0.5">
                {config?.telephony_mode === "dedicated_vmn" 
                  ? "Enterprise 10-digit Mobile PRI Trunk" 
                  : (config?.forwarding_phone_number ? `Smart Forwarding from ${config.forwarding_phone_number}` : "Smart Forwarding (*401*)")}
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                Active Bot Persona
              </span>
              <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                {config?.bot_name || "Maya"} ({config?.agent_persona || "Receptionist"})
              </span>
              <span className="text-xs text-muted-foreground block mt-0.5">
                Sub-500ms conversational turnaround
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                Human Desk Fallback
              </span>
              <span className="text-sm font-medium text-foreground flex items-center gap-1">
                <PhoneForwarded className="h-3.5 w-3.5 text-rose-500" />
                {config?.receptionist_phone || "08047283676"}
              </span>
              <span className="text-xs text-muted-foreground block mt-0.5">
                Instant warm transfer destination
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                Multi-Language Support
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 block truncate">
                {config?.enabled_languages?.join(", ") || "English, Hindi, Kannada"}
              </span>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                Dynamic mid-call auto-detection
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <PhoneCall className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{callLogs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Inbound & outbound sessions</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spoken Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMinutes.toFixed(1)}m</div>
            <p className="text-xs text-muted-foreground mt-1">Patient voice talk-time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Telecom Cost</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totalCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">Metered billing rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Engine Cluster</CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              OCI Cluster (4 Workers)
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">Redis shared memory active</p>
          </CardContent>
        </Card>
      </div>

      {/* Live Call Logs & Transcripts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Patient Conversations</CardTitle>
            <CardDescription>Real-time call transcripts, outcomes, and DPDP-redacted logs.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {callLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20 rounded-lg border border-dashed">
              <PhoneCall className="h-8 w-8 text-muted-foreground mb-4" />
              <p className="text-sm font-medium">No calls logged yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Dial <span className="font-mono font-semibold text-foreground">{config?.virtual_number || "08047283676"}</span> from any mobile phone to test your newly configured AI receptionist.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {callLogs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                return (
                  <div key={log.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="font-medium text-sm flex items-center gap-2">
                          {log.contact_phone}
                          {log.emergency_flag && (
                            <Badge variant="destructive" className="text-[10px] py-0">
                              Emergency Alert
                            </Badge>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {new Date(log.created_at).toLocaleString()} • {log.direction === 'inbound' ? '↓ Inbound' : '↑ Outbound'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground font-mono">{log.duration_seconds}s</span>
                        
                        <Badge 
                          variant="outline"
                          className={
                            log.outcome === 'appointment_booked'
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : log.outcome === 'emergency_escalated'
                              ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {log.outcome?.replace("_", " ")}
                        </Badge>

                        {log.transcript && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            Transcript
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Turn-by-Turn Transcript Box */}
                    {isExpanded && log.transcript && (
                      <div className="mt-3 p-3.5 rounded-lg bg-muted/30 border text-xs space-y-2">
                        <div className="flex items-center justify-between pb-1 border-b text-[11px] text-muted-foreground">
                          <span className="font-semibold uppercase tracking-wider">Conversation Audit (DPDP Act Redacted)</span>
                          {log.summary && <span>{log.summary}</span>}
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {Array.isArray(log.transcript) ? (
                            log.transcript.map((turn: any, idx: number) => (
                              <div key={idx} className="flex gap-2">
                                <span className="font-semibold capitalize text-foreground shrink-0 w-14">
                                  {turn.role || "speaker"}:
                                </span>
                                <span className="text-muted-foreground">
                                  {turn.content || turn.text || ""}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="text-muted-foreground">{String(log.transcript)}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
