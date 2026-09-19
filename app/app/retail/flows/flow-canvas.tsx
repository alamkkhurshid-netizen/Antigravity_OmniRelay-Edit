"use client";

import { useState, useCallback } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  Connection,
  Edge
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MessageCircle, Save, Zap, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// --- Custom Nodes --- //

function TriggerNode({ data }: { data: any }) {
  return (
    <div className="flex w-64 flex-col rounded-xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-violet-50 px-3 py-2 flex items-center gap-2 border-b border-violet-100">
        <Zap className="size-4 text-violet-600" />
        <span className="text-xs font-bold text-violet-900">Incoming Message</span>
      </div>
      <div className="p-3 text-xs text-slate-600 font-medium">
        Keyword matches: <span className="text-violet-600 bg-violet-50 px-1 rounded">"order"</span>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-4 bg-violet-400 rounded-sm" />
    </div>
  );
}

function ActionNode({ data }: { data: any }) {
  return (
    <div className="flex w-64 flex-col rounded-xl border border-rose-200 bg-white shadow-sm overflow-hidden">
      <Handle type="target" position={Position.Left} className="w-2 h-4 bg-rose-400 rounded-sm" />
      <div className="bg-rose-50 px-3 py-2 flex items-center gap-2 border-b border-rose-100">
        <Settings2 className="size-4 text-rose-600" />
        <span className="text-xs font-bold text-rose-900">Action</span>
      </div>
      <div className="p-3 text-xs text-slate-600 font-medium">
        Route to: <span className="font-bold text-slate-900">Staff Inbox</span>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-4 bg-rose-400 rounded-sm" />
    </div>
  );
}

function MessageNode({ data }: { data: any }) {
  return (
    <div className="flex w-64 flex-col rounded-xl border border-sky-200 bg-white shadow-sm overflow-hidden">
      <Handle type="target" position={Position.Left} className="w-2 h-4 bg-sky-400 rounded-sm" />
      <div className="bg-sky-50 px-3 py-2 flex items-center gap-2 border-b border-sky-100">
        <MessageCircle className="size-4 text-sky-600" />
        <span className="text-xs font-bold text-sky-900">Reply Message</span>
      </div>
      <div className="p-3 text-xs text-slate-600 font-medium">
        "Here is our latest catalog!"
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-4 bg-sky-400 rounded-sm" />
    </div>
  );
}

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  message: MessageNode,
};

// --- Initial Data --- //
const initialNodes = [
  { id: "1", type: "trigger", position: { x: 50, y: 150 }, data: { label: "Trigger" } },
  { id: "2", type: "message", position: { x: 400, y: 50 }, data: { label: "Auto Reply" } },
  { id: "3", type: "action", position: { x: 400, y: 250 }, data: { label: "Notify Staff" } },
];

const initialEdges = [
  { id: "e1-2", source: "1", target: "2", animated: true, style: { stroke: '#a855f7', strokeWidth: 2 } },
  { id: "e1-3", source: "1", target: "3", style: { stroke: '#94a3b8', strokeWidth: 2 } },
];

export function FlowCanvas({ organizationId }: { organizationId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("retail_flows")
      .insert({
        organization_id: organizationId,
        name: "Main Order Flow",
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),
        is_active: true
      });
      
    setSaving(false);
    if (error) {
      alert("Failed to save flow");
    } else {
      alert("Flow deployed successfully!");
    }
  };

  return (
    <div className="h-full w-full relative">
      <div className="absolute top-4 right-4 z-10">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-slate-800 disabled:opacity-50"
        >
          <Save className="size-4" /> {saving ? "Saving..." : "Deploy Flow"}
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-slate-50"
      >
        <Controls />
        <MiniMap zoomable pannable nodeColor={(n) => {
          if (n.type === 'trigger') return '#8b5cf6';
          if (n.type === 'action') return '#f43f5e';
          if (n.type === 'message') return '#0ea5e9';
          return '#eee';
        }} />
        <Background color="#cbd5e1" gap={16} />
      </ReactFlow>
    </div>
  );
}
