"use client";

import { useEffect } from "react";
import { Store, RotateCcw } from "lucide-react";

export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Storefront Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Store className="size-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Unable to load catalog</h2>
        <p className="mt-2 text-sm text-slate-500">
          We couldn&apos;t load the product catalog right now. Please check your internet connection or try again.
        </p>
        <button
          onClick={() => reset()}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors"
        >
          <RotateCcw className="size-4" />
          Reload Store
        </button>
      </div>
    </div>
  );
}
