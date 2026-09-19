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
    <div className="w-full max-w-md rounded-3xl border border-border bg-white p-6 shadow-[0_20px_60px_rgba(7,19,38,.1)] sm:p-8">
      <span className="text-xs font-black tracking-[.18em] text-primary">WELCOME TO OMNIRELAY</span>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight">Sign in to your workspace</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Use your work account to open the clinic workspace.</p>
      <button className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-bold hover:bg-muted disabled:opacity-50" onClick={googleSignIn} disabled={busy}>
        <img src="/google-g.png" alt="" className="size-5 object-contain" aria-hidden="true" /> Continue with Google
      </button>
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">or</div>
      <div className="rounded-xl bg-secondary/60 p-3 text-xs leading-5 text-secondary-foreground">Email link, phone OTP and WhatsApp login will be enabled in the channel-launch stage.</div>
      <form className="mt-5 grid gap-4" onSubmit={signIn}>
        <label className="grid gap-2 text-sm font-bold">Work email<input className="min-h-12 rounded-xl border border-input bg-white px-3 text-sm outline-none ring-ring focus:ring-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required /></label>
        <label className="grid gap-2 text-sm font-bold">Password<input className="min-h-12 rounded-xl border border-input bg-white px-3 text-sm outline-none ring-ring focus:ring-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required /></label>
        <button className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50" disabled={busy}>
          {busy ? "Please wait…" : "Sign in"}
        </button>
      </form>
      {message && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="status">{message}</p>}
      <p className="mt-5 text-xs leading-5 text-muted-foreground">By continuing, you agree to OmniRelay’s Terms and Privacy Policy.</p>
    </div>
  );
}
