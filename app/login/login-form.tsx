"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) window.location.assign("/app");
      if (error) setMessage(error.message);
    } catch {
      setMessage("Sign-in is temporarily unavailable. Please refresh and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/app`,
        },
      });
      if (error) setMessage(error.message);
    } catch {
      setMessage("Google sign-in is temporarily unavailable. Please refresh and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm">
      <span className="text-xs font-bold tracking-widest text-[#087fb9] uppercase mb-4 block">Welcome to OmniRelay</span>
      <h2 className="text-3xl font-semibold tracking-tight text-slate-900 mb-2">Sign in to your workspace</h2>
      <p className="text-sm leading-relaxed text-slate-500 mb-8">
        Use your work account to open the clinic workspace.
      </p>
      
      <button 
        onClick={googleSignIn} 
        disabled={busy}
        className="inline-flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-all shadow-sm"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/google-g.png" alt="" className="w-5 h-5 object-contain" aria-hidden="true" /> 
        Continue with Google
      </button>
      
      <div className="my-8 flex items-center gap-4 text-xs font-medium text-slate-400 uppercase tracking-widest before:h-px before:flex-1 before:bg-slate-100 after:h-px after:flex-1 after:bg-slate-100">
        or
      </div>
      
      <div className="rounded-xl bg-[#087fb9]/5 border border-[#087fb9]/10 p-4 mb-6">
        <p className="text-xs leading-relaxed text-[#087fb9]">
          Email link, phone OTP and WhatsApp login will be enabled in the channel-launch stage.
        </p>
      </div>
      
      <form className="grid gap-5" onSubmit={signIn}>
        <div className="grid gap-2 text-sm font-semibold text-slate-700">
          <label htmlFor="email">Work email</label>
          <input 
            id="email"
            className="min-h-[48px] rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-[#18bfc5] focus:ring-4 focus:ring-[#18bfc5]/10 transition-all text-slate-900 placeholder:text-slate-400" 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            placeholder="you@company.com" 
            required 
          />
        </div>
        
        <div className="grid gap-2 text-sm font-semibold text-slate-700">
          <label htmlFor="password">Password</label>
          <input 
            id="password"
            className="min-h-[48px] rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-[#18bfc5] focus:ring-4 focus:ring-[#18bfc5]/10 transition-all text-slate-900 placeholder:text-slate-400" 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            placeholder="••••••••" 
            required 
          />
        </div>
        
        <button 
          className="mt-2 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-gradient-to-r from-[#087fb9] to-[#18bfc5] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-[0_4px_14px_rgba(8,127,185,0.2)] hover:shadow-[0_6px_20px_rgba(8,127,185,0.3)] hover:-translate-y-0.5" 
          disabled={busy}
        >
          {busy ? "Please wait…" : "Sign in"}
        </button>
      </form>
      
      {message && (
        <div className="mt-6 rounded-xl bg-red-50 border border-red-100 p-4" role="status">
          <p className="text-sm text-red-800 font-medium">{message}</p>
        </div>
      )}
      
      <p className="mt-8 text-xs leading-relaxed text-slate-400 text-center">
        By continuing, you agree to OmniRelay's <a href="/terms" className="hover:text-slate-600 underline underline-offset-2">Terms</a> and <a href="/privacy" className="hover:text-slate-600 underline underline-offset-2">Privacy Policy</a>.
      </p>
    </div>
  );
}
