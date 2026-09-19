"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

type Message = { role: "user" | "cto"; text: string; sources?: { title: string; similarity: number }[] };

export function CtoWorkspace() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "cto", text: "I am the Super CTO for OmniRelay. I designed the Meta CAPI pipeline, the Action Centre, and the RAG bots. Ask me why we built a feature, how it works, or what value it delivers." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMessage }]);
    setLoading(true);

    const historyText = messages.slice(-4).map(m => `${m.role.toUpperCase()}: ${m.text}`).join("\n");

    try {
      const response = await fetch("/api/agents/cto-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage, history: historyText })
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessages(prev => [...prev, { role: "cto", text: data.answer, sources: data.sources }]);
      } else {
        setMessages(prev => [...prev, { role: "cto", text: `**Error:** ${data.error}` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "cto", text: "**Error:** Failed to connect to the Super CTO brain." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto p-6">
      <header className="mb-6">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-3 py-1 rounded-full">Meta-Agent Layer</span>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 mt-3">Super CTO Architecture Bot</h1>
        <p className="text-slate-600 mt-2">Ask detailed questions about OmniRelay&apos;s architecture, AI pipelines, and business logic.</p>
      </header>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-6 shadow-inner"
      >
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl p-5 shadow-sm ${
              msg.role === "user" 
                ? "bg-blue-600 text-white rounded-br-none" 
                : "bg-white border border-slate-200 rounded-tl-none prose prose-slate max-w-none"
            }`}>
              <div className="font-bold text-xs uppercase tracking-wider mb-2 opacity-70">
                {msg.role === "user" ? "You" : "Super CTO"}
              </div>
              
              {msg.role === "user" ? (
                <p className="whitespace-pre-wrap">{msg.text}</p>
              ) : (
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              )}

              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Sources Referenced:</p>
                  <ul className="text-xs text-slate-500 space-y-1">
                    {msg.sources.map((src, j) => (
                      <li key={j} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        {src.title} <span className="opacity-60">({Math.round(src.similarity * 100)}% match)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-5 shadow-sm">
              <div className="flex gap-1.5 items-center">
                <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce"></div>
                <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Why did we build the Action Centre?"
          disabled={loading}
          className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow shadow-sm disabled:opacity-50 disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="bg-slate-900 text-white font-bold px-6 py-3 rounded-xl hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Ask CTO
        </button>
      </form>
    </main>
  );
}
