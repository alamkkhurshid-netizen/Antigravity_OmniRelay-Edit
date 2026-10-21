"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthConfirmPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const urlParams = new URLSearchParams(window.location.search);
    const nextPath = urlParams.get("next") || "/app/integrations";
    const shareParam = urlParams.get("_vercel_share");
    const nextUrl = shareParam
      ? `${nextPath}${nextPath.includes("?") ? "&" : "?"}_vercel_share=${encodeURIComponent(shareParam)}`
      : nextPath;

    // 1. Check if token_hash is in query params (server OTP flow)
    const tokenHash = urlParams.get("token_hash");
    const type = (urlParams.get("type") as "magiclink" | "email" | "signup" | "invite" | "recovery") || "magiclink";

    if (tokenHash) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ data, error: verifyErr }) => {
        if (!active) return;
        if (verifyErr) {
          setError(verifyErr.message);
        } else if (data.session) {
          window.location.assign(nextUrl);
        }
      });
      return;
    }

    // 1b. Check if access_token & refresh_token are in the hash fragment (Supabase redirect)
    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ data, error: setErr }) => {
          if (!active) return;
          if (setErr) {
            setError(setErr.message);
          } else if (data.session) {
            window.location.assign(nextUrl);
          }
        });
        return;
      }
    }

    // 2. Listen to auth state changes (captures access_token parsed from hash by createBrowserClient)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session) {
        window.location.assign(nextUrl);
      }
    });

    // 3. Check existing/parsed session
    supabase.auth.getSession().then(({ data: { session }, error: sessionErr }) => {
      if (!active) return;
      if (sessionErr) {
        setError(sessionErr.message);
      } else if (session) {
        window.location.assign(nextUrl);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center font-sans">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-[#087fb9]">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
        </div>
        <h2 className="text-xl font-semibold text-slate-800">Signing in to workspace…</h2>
        <p className="mt-2 text-sm text-slate-500">
          Establishing your secure session. You will be redirected momentarily.
        </p>
        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
