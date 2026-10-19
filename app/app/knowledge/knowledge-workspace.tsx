"use client";

import React, { useState } from "react";
import { 
  BookOpen, 
  Search, 
  Plus, 
  RotateCw, 
  Trash2, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Send, 
  DownloadCloud
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  source_type: "faq" | "policy" | "service" | "business_info";
  status: "draft" | "approved" | "archived";
  embedding_status: "pending" | "indexed" | "failed";
  updated_at: string;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  faq: "Patient FAQ",
  policy: "Clinic Policy",
  service: "Service & Pricing",
  business_info: "Chamber & Timings",
};

const CLINIC_STARTER_PACK = [
  {
    title: "Clinic OPD Consultation Hours & Schedule",
    source_type: "business_info" as const,
    content: "Our clinic OPD is open Monday to Saturday from 9:00 AM to 1:00 PM (Morning Session) and 5:00 PM to 8:30 PM (Evening Session). We are closed on Sundays except for pre-scheduled emergency procedures. Please arrive 15 minutes before your scheduled slot.",
  },
  {
    title: "Patient Consultation Fees & Payment Methods",
    source_type: "policy" as const,
    content: "Standard consultation fee is ₹500 for general physician OPD and ₹800 for super-specialty visits. We accept Cash, UPI (Google Pay, PhonePe, Paytm), and Credit/Debit Cards at the reception desk. Payment confirmation is generated immediately.",
  },
  {
    title: "Appointment Rescheduling & Cancellation Policy",
    source_type: "policy" as const,
    content: "Patients can reschedule or cancel appointments up to 2 hours before the scheduled time through WhatsApp or by calling the clinic reception. There is no cancellation penalty.",
  },
  {
    title: "Emergency Care & Non-Clinical Disclaimer",
    source_type: "faq" as const,
    content: "OmniRelay WhatsApp Concierge provides administrative and booking support only. It does not provide medical diagnoses or prescription changes. For acute symptoms such as chest pain or breathing difficulty, please visit the emergency room immediately.",
  },
];

export function KnowledgeWorkspace({
  initialItems,
  organizationName: _organizationName,
}: {
  initialItems: KnowledgeItem[];
  organizationName: string;
}) {
  const [items, setItems] = useState<KnowledgeItem[]>(initialItems);
  const [activeTab, setActiveTab] = useState<"library" | "create" | "test">("library");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Create form state
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<"faq" | "policy" | "service" | "business_info">("faq");
  const [newContent, setNewContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Indexing state
  const [indexing, setIndexing] = useState(false);
  const [indexFeedback, setIndexFeedback] = useState<string | null>(null);

  // Playground state
  const [testQuestion, setTestQuestion] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    answer: string;
    confidence: string;
    classification?: string;
    sources?: Array<{ id: string; title: string; excerpt: string }>;
  } | null>(null);

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.source_type === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const totalIndexed = items.filter((i) => i.embedding_status === "indexed").length;
  const totalPending = items.filter((i) => i.embedding_status === "pending").length;

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/knowledge/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          content: newContent,
          source_type: newCategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save document");

      setItems((prev) => [data.data.item, ...prev]);
      setNewTitle("");
      setNewContent("");
      setActiveTab("library");
      setIndexFeedback("Document saved! Click 'Sync & Index' to vectorize for AI concierge.");
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save knowledge item");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this document from the knowledge base?")) return;
    try {
      const res = await fetch(`/api/knowledge/items?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  }

  async function handleIndexAll() {
    setIndexing(true);
    setIndexFeedback(null);
    try {
      const res = await fetch("/api/agents/index", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Indexing failed");

      setIndexFeedback(`Indexing complete! ${data.completed?.length ?? items.length} documents vectorized into pgvector.`);
      // Refresh items to show 'indexed' status
      setItems((prev) =>
        prev.map((i) => ({ ...i, embedding_status: "indexed" as const }))
      );
    } catch (err: unknown) {
      setIndexFeedback(err instanceof Error ? `Indexing error: ${err.message}` : "Indexing error");
    } finally {
      setIndexing(false);
    }
  }

  async function handleLoadStarterPack() {
    if (!confirm("Load 4 standard clinic templates (OPD hours, fees, policies, disclaimers)?")) return;
    setSubmitting(true);
    try {
      for (const tpl of CLINIC_STARTER_PACK) {
        const res = await fetch("/api/knowledge/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tpl),
        });
        if (res.ok) {
          const data = await res.json();
          setItems((prev) => [data.data.item, ...prev]);
        }
      }
      setIndexFeedback("Clinic Knowledge Pack loaded! Click 'Sync & Index' to make live.");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTestSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!testQuestion.trim()) return;
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/agents/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: testQuestion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search preview failed");
      setTestResult(data);
    } catch (err: unknown) {
      setTestResult({
        answer: `Error running preview: ${err instanceof Error ? err.message : "Preview error"}`,
        confidence: "error",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Top Banner & Metrics */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Total Knowledge</span>
            <BookOpen className="size-4 text-[#087fb9]" />
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">{items.length}</div>
          <p className="mt-1 text-xs text-slate-500">Documents & FAQs</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-600 uppercase tracking-wider">
            <span>Vector Indexed</span>
            <CheckCircle2 className="size-4 text-emerald-500" />
          </div>
          <div className="mt-3 text-3xl font-bold text-emerald-700">{totalIndexed}</div>
          <p className="mt-1 text-xs text-slate-500">Live in pgvector</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-600 uppercase tracking-wider">
            <span>Pending Index</span>
            <Clock className="size-4 text-amber-500" />
          </div>
          <div className="mt-3 text-3xl font-bold text-amber-700">{totalPending}</div>
          <p className="mt-1 text-xs text-slate-500">Awaiting re-index</p>
        </div>

        <div className="flex flex-col justify-center gap-2 rounded-2xl border border-[#18bfc5]/30 bg-gradient-to-br from-[#18bfc5]/10 to-white p-4 shadow-sm">
          <Button
            onClick={handleIndexAll}
            disabled={indexing}
            className="w-full bg-gradient-to-r from-[#087fb9] to-[#18bfc5] text-white font-semibold hover:opacity-90 shadow-sm"
          >
            <RotateCw className={`size-4 mr-2 ${indexing ? "animate-spin" : ""}`} />
            {indexing ? "Vectorizing..." : "Sync & Index All"}
          </Button>

          {items.length === 0 && (
            <Button
              onClick={handleLoadStarterPack}
              disabled={submitting}
              variant="outline"
              size="sm"
              className="w-full text-xs"
            >
              <DownloadCloud className="size-3.5 mr-1 text-[#087fb9]" />
              Load Clinic Pack
            </Button>
          )}
        </div>
      </div>

      {indexFeedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span>{indexFeedback}</span>
          </div>
          <button onClick={() => setIndexFeedback(null)} className="text-xs font-bold text-emerald-700 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab("library")}
            className={`pb-4 text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 ${
              activeTab === "library"
                ? "border-[#087fb9] text-[#087fb9]"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <BookOpen className="size-4" />
            Knowledge Library ({items.length})
          </button>

          <button
            onClick={() => setActiveTab("create")}
            className={`pb-4 text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 ${
              activeTab === "create"
                ? "border-[#087fb9] text-[#087fb9]"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Plus className="size-4" />
            Add Knowledge
          </button>

          <button
            onClick={() => setActiveTab("test")}
            className={`pb-4 text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 ${
              activeTab === "test"
                ? "border-[#087fb9] text-[#087fb9]"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Sparkles className="size-4 text-[#18bfc5]" />
            AI RAG Playground
          </button>
        </nav>
      </div>

      {/* Tab 1: Library */}
      {activeTab === "library" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search FAQs, policies, keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {["all", "faq", "policy", "service", "business_info"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    categoryFilter === cat
                      ? "bg-[#087fb9] text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {cat === "all" ? "All Categories" : CATEGORY_LABELS[cat] || cat}
                </button>
              ))}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <EmptyState
              title="No knowledge documents found"
              description="Upload clinic FAQs, consultation policies, and doctor profiles so the WhatsApp AI Concierge can answer patients accurately."
              icon={<BookOpen className="h-6 w-6 text-slate-400" />}
              action={
                <Button onClick={() => setActiveTab("create")} size="sm" className="mt-2 bg-[#087fb9] text-white">
                  <Plus className="size-4 mr-1.5" />
                  Add First Document
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-[#18bfc5]/50 hover:shadow-md transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                        {CATEGORY_LABELS[item.source_type] || item.source_type}
                      </span>
                      <StatusBadge
                        status={
                          item.embedding_status === "indexed"
                            ? "active"
                            : item.embedding_status === "failed"
                            ? "failed"
                            : "pending"
                        }
                        label={
                          item.embedding_status === "indexed"
                            ? "Indexed"
                            : item.embedding_status === "failed"
                            ? "Failed"
                            : "Pending Sync"
                        }
                      />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 group-hover:text-[#087fb9] transition-colors">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-xs text-slate-500 line-clamp-3 leading-relaxed">
                      {item.content}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>Updated {new Date(item.updated_at).toLocaleDateString()}</span>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-slate-400 hover:text-red-600 transition-colors p-1"
                      title="Delete document"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Add Knowledge Form */}
      {activeTab === "create" && (
        <SectionCard
          title="Add New Clinic Knowledge Document"
          description="Provide verified factual information about your practice. The AI concierge will cite this information when responding to patient inquiries on WhatsApp."
        >
          <form onSubmit={handleCreateItem} className="space-y-6">
            {formError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {formError}
              </div>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Document Title</label>
                <Input
                  required
                  placeholder="e.g. Doctor Consulting Fees & Card Acceptance"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Category</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-[#18bfc5] focus:ring-4 focus:ring-[#18bfc5]/10"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as KnowledgeItem["source_type"])}
                >
                  <option value="faq">Patient FAQ</option>
                  <option value="policy">Clinic Policy & Terms</option>
                  <option value="service">Services & Pricing</option>
                  <option value="business_info">Chamber & Timings Info</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Content / Document Body</label>
                <span className="text-xs text-slate-400">{newContent.length} / 20,000 characters</span>
              </div>
              <Textarea
                required
                rows={8}
                placeholder="Enter detailed facts, guidelines, or procedures. Clear and concise explanations result in higher-confidence AI answers."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
              <Button
                type="submit"
                disabled={submitting || newContent.trim().length < 10}
                className="bg-gradient-to-r from-[#087fb9] to-[#18bfc5] text-white font-semibold"
              >
                {submitting ? "Saving..." : "Save & Queue for Indexing"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab("library")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </SectionCard>
      )}

      {/* Tab 3: RAG Retrieval Playground */}
      {activeTab === "test" && (
        <div className="space-y-6">
          <SectionCard
            title="AI Knowledge Retrieval Playground"
            description="Test how the OmniRelay AI Concierge evaluates patient questions against your indexed documents. Inspect the generated answer, confidence score, and matching source citations."
          >
            <form onSubmit={handleTestSearch} className="flex gap-3">
              <Input
                placeholder="Type a patient question (e.g. 'What are your consultation timings?')"
                value={testQuestion}
                onChange={(e) => setTestQuestion(e.target.value)}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={testing || !testQuestion.trim()}
                className="bg-[#087fb9] text-white"
              >
                <Send className="size-4 mr-2" />
                {testing ? "Testing..." : "Test AI Query"}
              </Button>
            </form>

            {testResult && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">AI CONCIERGE RESPONSE</span>
                  <StatusBadge
                    status={
                      testResult.confidence === "high"
                        ? "active"
                        : testResult.confidence === "medium"
                        ? "pending"
                        : "failed"
                    }
                    label={`Confidence: ${testResult.confidence.toUpperCase()}`}
                  />
                </div>

                <p className="text-sm font-medium text-slate-800 leading-relaxed bg-white p-4 rounded-xl border border-slate-200">
                  {testResult.answer}
                </p>

                {testResult.sources && testResult.sources.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-600">Matching Source Citations:</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {testResult.sources.map((src, i) => (
                        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                          <b className="block text-slate-900 mb-1">{src.title}</b>
                          <span className="text-slate-500 line-clamp-2">{src.excerpt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
