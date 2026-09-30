"use client";

import { FormEvent } from "react";
import { KnowledgeDocument, Agent } from "@/app/app/agents/types";
import { sourceLabels } from "@/app/app/agents/use-knowledge-workspace";

interface AddKnowledgeModalProps {
  showForm: boolean;
  setShowForm: (val: boolean) => void;
  busy: boolean;
  addKnowledge: (event: FormEvent<HTMLFormElement>) => void;
}

export function AddKnowledgeModal({ showForm, setShowForm, busy, addKnowledge }: AddKnowledgeModalProps) {
  if (!showForm) return null;
  return (
    <div className="knowledge-modal-backdrop" onClick={()=>setShowForm(false)}>
      <form className="knowledge-modal" onSubmit={addKnowledge} onClick={(event)=>event.stopPropagation()}>
        <header>
          <div><span className="app-eyebrow">NEW SOURCE</span><h3>Add trusted knowledge</h3></div>
          <button type="button" onClick={()=>setShowForm(false)} aria-label="Close">×</button>
        </header>
        <label>Title<input name="title" required minLength={2} maxLength={160} placeholder="How should patients prepare for a consultation?"/></label>
        <label>Type
          <select name="source_type">
            {Object.entries(sourceLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>Approved answer or information
          <textarea name="content" required minLength={10} maxLength={20000} placeholder="Write the exact information the agent may use. Avoid patient-specific or confidential data."/>
        </label>
        <label>Status
          <select name="status">
            <option value="approved">Approved for future agent use</option>
            <option value="draft">Save as draft</option>
          </select>
        </label>
        <button className="primary-button" disabled={busy}>{busy?"Saving…":"Save knowledge"}</button>
      </form>
    </div>
  );
}


interface EditKnowledgeModalProps {
  editing: KnowledgeDocument | null;
  setEditing: (val: KnowledgeDocument | null) => void;
  busy: boolean;
  saveEdit: (event: FormEvent<HTMLFormElement>) => void;
}

export function EditKnowledgeModal({ editing, setEditing, busy, saveEdit }: EditKnowledgeModalProps) {
  if (!editing) return null;
  return (
    <div className="knowledge-modal-backdrop" onClick={()=>setEditing(null)}>
      <form className="knowledge-modal" onSubmit={saveEdit} onClick={(event)=>event.stopPropagation()}>
        <header>
          <div><span className="app-eyebrow">EDIT FAQ</span><h3>Review the patient answer</h3></div>
          <button type="button" onClick={()=>setEditing(null)} aria-label="Close">×</button>
        </header>
        <label>Patient question<input name="title" required minLength={2} maxLength={160} defaultValue={editing.title}/></label>
        <label>Clinic-approved answer<textarea name="content" required minLength={10} maxLength={20000} defaultValue={editing.content}/></label>
        <label>Patient-use status
          <select name="status" defaultValue={editing.status}>
            <option value="draft">Draft — not available to patients</option>
            <option value="approved">Approved — eligible for concierge answers</option>
            <option value="archived">Disabled</option>
          </select>
        </label>
        <div className="faq-safety-note">
          <b>Clinical safety</b>
          <span>Do not add diagnosis, medicine selection, dosage or treatment decisions. Send those questions to authorized staff.</span>
        </div>
        <button className="primary-button" disabled={busy}>{busy?"Saving…":"Save reviewed FAQ"}</button>
      </form>
    </div>
  );
}

interface AgentSettingsModalProps {
  showAgentSettings: boolean;
  setShowAgentSettings: (val: boolean) => void;
  activeAgent?: Agent;
  busy: boolean;
  saveAgentSettings: (event: FormEvent<HTMLFormElement>) => void;
}

export function AgentSettingsModal({ showAgentSettings, setShowAgentSettings, activeAgent, busy, saveAgentSettings }: AgentSettingsModalProps) {
  if (!showAgentSettings || !activeAgent) return null;
  return (
    <div className="knowledge-modal-backdrop" onClick={()=>setShowAgentSettings(false)}>
      <form className="knowledge-modal agent-settings-modal" onSubmit={saveAgentSettings} onClick={(event)=>event.stopPropagation()}>
        <header>
          <div><span className="app-eyebrow">CONCIERGE CONTROLS</span><h3>Configure the supervised agent</h3></div>
          <button type="button" onClick={()=>setShowAgentSettings(false)} aria-label="Close">×</button>
        </header>
        <label>Concierge name<input name="name" required minLength={2} maxLength={80} defaultValue={activeAgent.name}/></label>
        <label>Operating instructions<textarea name="instructions" required minLength={30} maxLength={3000} defaultValue={activeAgent.instructions}/></label>
        <label>Human handoff message<textarea name="handoff_message" required minLength={10} maxLength={500} defaultValue={activeAgent.handoff_message}/></label>
        <label>Operating state
          <select name="status" defaultValue={activeAgent.status}>
            <option value="training">Training — patient use disabled</option>
            <option value="ready">Ready — supervised pilot</option>
            <option value="paused">Paused</option>
            {activeAgent.status==="live"&&<option value="live">Live</option>}
          </select>
        </label>
        <label className="channel-check">
          <input type="checkbox" name="whatsapp" defaultChecked={activeAgent.channels.includes("whatsapp")}/>
          <span><b>Enable WhatsApp pilot channel</b><small>This prepares the profile only. Automatic replies remain blocked until the outbound workflow is separately activated.</small></span>
        </label>
        <div className="faq-safety-note">
          <b>Hard safety boundary</b>
          <span>Medical advice, diagnosis, medication selection, dosage changes and urgent symptoms are routed away from normal answering.</span>
        </div>
        <button className="primary-button" disabled={busy}>{busy?"Saving controls…":"Save concierge controls"}</button>
      </form>
    </div>
  );
}
