"use client";

import { useTransition, useState } from "react";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { generateCreatives } from "./actions";

export function GenerateForm() {
  const [isPending, startTransition] = useTransition();
  const [aiError, setAiError] = useState("");

  async function onSubmit(formData: FormData) {
    setAiError("");
    startTransition(async () => {
      const result = await generateCreatives(formData);
      if (result?.error) {
        setAiError(result.error);
      }
    });
  }

  return (
    <div className="grid gap-3">
      <form action={onSubmit} className="flex items-center gap-2">
        <input 
          type="file" 
          name="productImage"
          accept="image/*"
          capture="environment"
          required
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-fuchsia-500 sm:w-80 disabled:opacity-50 file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-fuchsia-50 file:text-fuchsia-700 hover:file:bg-fuchsia-100"
          disabled={isPending}
        />
        <button 
          type="submit" 
          disabled={isPending}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow hover:bg-slate-800 transition-colors disabled:opacity-70 min-w-[140px] justify-center"
        >
          {isPending ? (
            <><Loader2 className="size-4 animate-spin" /> Verifying...</>
          ) : (
            <><Sparkles className="size-4" /> Generate Ads</>
          )}
        </button>
      </form>
      
      {aiError && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 animate-in slide-in-from-top-2">
          <AlertCircle className="size-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="grid gap-1">
            <b className="font-bold text-rose-900">Retake Required</b>
            <p>{aiError}</p>
          </div>
        </div>
      )}
    </div>
  );
}
