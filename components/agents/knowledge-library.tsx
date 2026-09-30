"use client";

import { KnowledgeDocument } from "@/app/app/agents/types";
import { sourceLabels } from "@/app/app/agents/use-knowledge-workspace";

interface KnowledgeLibraryProps {
  rows: KnowledgeDocument[];
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  query: string;
  setQuery: (val: string) => void;
  starterTitles: Set<string>;
  setEditing: (item: KnowledgeDocument) => void;
  toggleStatus: (item: KnowledgeDocument) => void;
}

export function KnowledgeLibrary({
  rows, statusFilter, setStatusFilter, query, setQuery, starterTitles, setEditing, toggleStatus
}: KnowledgeLibraryProps) {
  return (
    <section className="knowledge-panel">
      <header>
        <div>
          <span className="app-eyebrow">KNOWLEDGE LIBRARY</span>
          <h3>{rows.length} sources</h3>
        </div>
        <div className="knowledge-tools">
          <select aria-label="Filter knowledge by status" value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="archived">Disabled</option>
          </select>
          <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search knowledge…"/>
        </div>
      </header>
      {rows.length === 0 ? (
        <div className="knowledge-empty">
          <b>No knowledge added yet</b>
          <span>Start with clinic hours, preparation guidance, cancellation policy and common appointment questions.</span>
        </div>
      ) : (
        <div className="knowledge-list">
          {rows.map((item)=>(
            <article key={item.id}>
              <div className="knowledge-badge">{sourceLabels[item.source_type]??item.source_type}</div>
              <div>
                <h4>{item.title}</h4>
                <p>{item.content}</p>
                <small>{starterTitles.has(item.title as any)?"Starter FAQ · ":""}Updated {new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",year:"numeric"}).format(new Date(item.updated_at))} · {item.embedding_status==="indexed"?"Indexed":"Indexing pending"}</small>
              </div>
              <div className="knowledge-row-actions">
                <button type="button" onClick={()=>setEditing(item)}>Edit</button>
                <button className={item.status==="approved"?"status-approved":"status-archived"} onClick={()=>void toggleStatus(item)}>
                  {item.status==="approved"?"Approved":item.status==="draft"?"Approve":"Disabled"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
