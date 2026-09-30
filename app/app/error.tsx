"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Workspace Error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center max-w-md p-8 text-center bg-white border rounded-2xl shadow-sm border-slate-200">
        <div className="flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-red-100 text-red-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-slate-900">Something went wrong</h2>
        <p className="mb-6 text-sm text-slate-500">
          We encountered an error loading this workspace page. You can try refreshing the page or checking your connection.
        </p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 text-sm font-semibold text-white transition-colors rounded-xl bg-slate-900 hover:bg-slate-800"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
