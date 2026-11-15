"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle2 } from "lucide-react";

function LoginFormInner() {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [successNotice, setSuccessNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const showGoogleAuth = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true" || process.env.NODE_ENV === "test";

  useEffect(() => {
    if (searchParams.get("mode") === "signup") {
      setMode("signup");
    } else if (searchParams.get("mode") === "signin") {
      setMode("signin");
    }
  }, [searchParams]);

  useEffect(() => {
    // If redirected with an access token in the hash, establish session and redirect
    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          const nextUrl = new URLSearchParams(window.location.search).get("next") || "/app/integrations";
          window.location.assign(nextUrl);
        }
      });
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setSuccessNotice("");

    try {
      const supabase = createClient();
      if (mode === "signup") {
        if (password.length < 6) {
          setMessage("Password must be at least 6 characters.");
          setBusy(false);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
          },
        });
        if (error) {
          setMessage(error.message);
        } else if (data.session) {
          window.location.assign("/onboarding");
        } else if (data.user) {
          setSuccessNotice(
            `Account created! We've sent a verification link to ${email}. Please check your inbox to activate your workspace.`
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error) {
          const nextUrl = searchParams.get("next") || "/app";
          window.location.assign(nextUrl);
        } else {
          setMessage(error.message);
        }
      }
    } catch {
      setMessage("Authentication is temporarily unavailable. Please refresh and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setBusy(true);
    setMessage("");
    setSuccessNotice("");
    try {
      const supabase = createClient();
      const nextTarget = mode === "signup" ? "/onboarding" : (searchParams.get("next") || "/app");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${nextTarget}`,
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
      {/* Mode Toggle Tabs */}
      <div className="flex rounded-xl bg-slate-100 p-1 mb-6 border border-slate-200/60">
        <button
          type="button"
          onClick={() => { setMode("signin"); setMessage(""); setSuccessNotice(""); }}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            mode === "signin"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => { setMode("signup"); setMessage(""); setSuccessNotice(""); }}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
            mode === "signup"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          Create account
        </button>
      </div>

      <span className="text-xs font-bold tracking-widest text-[#087fb9] uppercase mb-2 block">
        {mode === "signup" ? "New Clinic Setup" : "Welcome to OmniRelay"}
      </span>
      <h2 className="text-3xl font-semibold tracking-tight text-slate-900 mb-2">
        {mode === "signup" ? "Create your workspace" : "Sign in to your workspace"}
      </h2>
      <p className="text-sm leading-relaxed text-slate-500 mb-6">
        {mode === "signup"
          ? "Start automating your clinic appointments, phone calls, and patient reminders."
          : "Use your work account to open the clinic workspace."}
      </p>

      {successNotice ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 mb-6 text-emerald-900">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <b className="block text-sm font-semibold mb-1">Check your email</b>
              <p className="text-xs leading-relaxed text-emerald-700">{successNotice}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {showGoogleAuth && (
            <>
              <button
                onClick={googleSignIn}
                disabled={busy}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-all shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/google-g.png" alt="" className="w-5 h-5 object-contain" aria-hidden="true" />
                {mode === "signup" ? "Sign up with Google" : "Continue with Google"}
              </button>

              <div className="my-6 flex items-center gap-4 text-xs font-medium text-slate-400 uppercase tracking-widest before:h-px before:flex-1 before:bg-slate-100 after:h-px after:flex-1 after:bg-slate-100">
                or
              </div>
            </>
          )}

          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-1.5 text-sm font-semibold text-slate-700">
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

            <div className="grid gap-1.5 text-sm font-semibold text-slate-700">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="min-h-[48px] rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-[#18bfc5] focus:ring-4 focus:ring-[#18bfc5]/10 transition-all text-slate-900 placeholder:text-slate-400"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Minimum 6 characters" : "••••••••"}
                required
              />
            </div>

            <button
              className="mt-2 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-gradient-to-r from-[#087fb9] to-[#18bfc5] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-[0_4px_14px_rgba(8,127,185,0.2)] hover:shadow-[0_6px_20px_rgba(8,127,185,0.3)] hover:-translate-y-0.5"
              disabled={busy}
            >
              {busy ? "Please wait…" : mode === "signup" ? "Create workspace" : "Sign in"}
            </button>
          </form>
        </>
      )}

      {message && (
        <div className="mt-6 rounded-xl bg-red-50 border border-red-100 p-4" role="status">
          <p className="text-sm text-red-800 font-medium">{message}</p>
        </div>
      )}

      <div className="mt-6 text-center">
        {mode === "signin" ? (
          <p className="text-xs text-slate-500">
            Don&apos;t have a workspace yet?{" "}
            <button
              type="button"
              onClick={() => { setMode("signup"); setMessage(""); setSuccessNotice(""); }}
              className="font-semibold text-[#087fb9] hover:underline"
            >
              Create account
            </button>
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Already have a workspace?{" "}
            <button
              type="button"
              onClick={() => { setMode("signin"); setMessage(""); setSuccessNotice(""); }}
              className="font-semibold text-[#087fb9] hover:underline"
            >
              Sign in
            </button>
          </p>
        )}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-slate-400 text-center">
        By continuing, you agree to OmniRelay&apos;s{" "}
        <a href="/terms" className="hover:text-slate-600 underline underline-offset-2">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="hover:text-slate-600 underline underline-offset-2">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<div className="w-full max-w-md p-8 text-center text-sm text-slate-400">Loading...</div>}>
      <LoginFormInner />
    </Suspense>
  );
}
