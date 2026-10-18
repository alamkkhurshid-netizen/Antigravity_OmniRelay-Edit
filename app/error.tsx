"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production, log to Sentry or internal error aggregator
    console.error("OmniRelay Application Error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
        <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangle className="size-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">An unexpected error occurred</h1>
          <p className="mt-2 text-sm text-slate-600">
            Our systems encountered a temporary interruption. Your data remains secure and protected.
          </p>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <button
              onClick={() => reset()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="size-4" />
              Try again
            </button>
            <a
              href="/app"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Home className="size-4" />
              Go to Dashboard
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
