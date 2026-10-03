"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhoneCall, Activity, Settings, Clock, IndianRupee } from "lucide-react";

interface VoiceCallLog {
  id: string;
  contact_phone: string;
  direction: "inbound" | "outbound";
  duration_seconds: number;
  outcome: string;
  created_at: string;
  cost_inr: number;
}

export function VoiceDashboard({ organizationId, callLogs = [] }: { organizationId: string; callLogs?: VoiceCallLog[] }) {
  // We will pass the server-fetched callLogs to this component.
  
  const totalMinutes = callLogs.reduce((acc, log) => acc + (log.duration_seconds || 0), 0) / 60;
  const totalCost = callLogs.reduce((acc, log) => acc + (log.cost_inr || 0), 0);

  return (
    <div className="space-y-6 mt-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">Voice AI Engine</h2>
        <p className="text-muted-foreground">Manage your AI Receptionist & Sales Agents.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <PhoneCall className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{callLogs.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Minutes Used</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMinutes.toFixed(1)}m</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Est. Cost</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totalCost.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Engine Status</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Online (Sub-500ms)</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Live Call History</CardTitle>
            <CardDescription>Recent outbound and inbound AI calls.</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Configure Agent
          </Button>
        </CardHeader>
        <CardContent>
          {callLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20 rounded-lg border border-dashed">
              <PhoneCall className="h-8 w-8 text-muted-foreground mb-4" />
              <p className="text-sm font-medium">No calls yet</p>
              <p className="text-sm text-muted-foreground">Make your first outbound call to see analytics.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {callLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-col">
                    <span className="font-medium">{log.contact_phone}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()} • {log.direction === 'inbound' ? '↓ Inbound' : '↑ Outbound'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">{log.duration_seconds}s</span>
                    <Badge variant={log.outcome === 'completed' ? 'default' : 'secondary'}>
                      {log.outcome}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
