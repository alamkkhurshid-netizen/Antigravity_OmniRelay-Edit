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
  Smartphone,
  CheckCircle2
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
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold tracking-tight">OmniRelay Dual Voice AI Cluster</h2>
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
              2 Active Agents
            </Badge>
            <Badge variant="outline" className="text-xs">
              {config?.telephony_mode === "dedicated_vmn" ? "Dedicated VMN Trunk" : "Smart Forwarding (*401*)"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enterprise Indian telephony cluster combining empathetic patient reception and high-EQ consultative sales.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setIsWizardOpen(true)}
            className="border-primary/40 hover:bg-primary/10"
          >
            <Settings className="h-4 w-4 mr-1.5 text-primary" />
            Configure Agents &amp; Phone Lines
          </Button>
        </div>
      </div>

      {/* Dual Voice AI Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Agent 1: AI Medical Receptionist */}
        <Card className="border-emerald-500/30 bg-card shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-lg">
                  👩‍⚕️
                </div>
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    {config?.bot_name || "Maya"}
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] py-0">
                      Inbound Receptionist
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Patient Triage, Appointments &amp; Reception Desk
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] bg-background">
                {config?.telephony_mode === "dedicated_vmn" ? "Dedicated VMN" : "*401* Forwarded"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-2 bg-muted/20 p-2.5 rounded-lg border">
              <div>
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Telephony Line</span>
                <span className="font-mono font-bold text-foreground">
                  {config?.telephony_mode === "dedicated_vmn"
                    ? (config?.vmn_number || "+91 98450 24001")
                    : (config?.virtual_number || "08047283676")}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Front Desk Transfer</span>
                <span className="font-mono text-rose-500 font-medium">
                  {config?.receptionist_phone || "Not set"}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                  Emotional Intelligence (EQ):
                </span>
                <span className="font-medium text-foreground capitalize">
                  {config?.receptionist_eq_tone || "Empathetic & Calm"}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Languages className="h-3.5 w-3.5 text-blue-500" />
                  Languages:
                </span>
                <span className="font-medium text-foreground truncate max-w-[180px]">
                  {config?.enabled_languages?.join(", ") || "English, Hindi, Kannada"}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-rose-500" />
                  Safety Protocol:
                </span>
                <span className="font-medium text-foreground">
                  &lt;10ms 108 Emergency Bypass
                </span>
              </div>
            </div>

            <div className="pt-2 border-t flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                Turnaround: <span className="font-semibold text-foreground">Sub-500ms</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                onClick={() => setIsWizardOpen(true)}
              >
                Edit Receptionist →
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Agent 2: AI Healthcare Sales & Revenue Agent */}
        <Card className="border-blue-500/30 bg-card shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center text-lg">
                  💼
                </div>
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    {config?.sales_agent_name || "Rohan"}
                    <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px] py-0">
                      Sales &amp; Growth Advisor
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Promotional Leads, Treatment Follow-ups &amp; No-Show Recovery
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className={`text-[10px] ${config?.sales_agent_active !== false ? "text-blue-600 border-blue-500/30" : "text-muted-foreground"}`}>
                {config?.sales_agent_active !== false ? "Active" : "Paused"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-2 bg-muted/20 p-2.5 rounded-lg border">
              <div>
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Calling Window</span>
                <span className="font-mono font-bold text-foreground">
                  {config?.outbound_calling_window?.start || "09:30"} - {config?.outbound_calling_window?.end || "19:30"}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Category</span>
                <span className="font-semibold text-foreground capitalize">
                  {config?.business_category || "Dental Clinic"}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                  Emotional Intelligence (EQ):
                </span>
                <span className="font-medium text-foreground capitalize">
                  {config?.sales_eq_style || "Consultative & Ethical"}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <IndianRupee className="h-3.5 w-3.5 text-emerald-500" />
                  Featured Package:
                </span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400 font-mono">
                  ₹{config?.sales_packages?.[0]?.price_inr || 999} ({config?.sales_packages?.[0]?.name || "Featured Offer"})
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                  Automated Triggers:
                </span>
                <span className="font-medium text-foreground">
                  No-Show Recovery (2h) + Offers
                </span>
              </div>
            </div>

            <div className="pt-2 border-t flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                Ethical Safeguard: <span className="font-semibold text-foreground">TRAI DND Scrubbed</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
                onClick={() => setIsWizardOpen(true)}
              >
                Edit Sales Agent →
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

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
