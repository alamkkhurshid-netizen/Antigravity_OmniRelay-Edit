"use client";

import { useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { generateCreatives } from "./actions";

export function GenerateForm() {
  const [isPending, startTransition] = useTransition();

  async function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await generateCreatives(formData);
      if (result?.error) {
        alert(result.error);
      }
    });
  }

  return (
    <form action={onSubmit} className="flex items-center gap-2">
      <input 
        type="url" 
        name="productUrl"
        required
        placeholder="Paste Shopify or Amazon URL..." 
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-fuchsia-500 sm:w-80 disabled:opacity-50"
        disabled={isPending}
      />
      <button 
        type="submit" 
        disabled={isPending}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow hover:bg-slate-800 transition-colors disabled:opacity-70 min-w-[140px] justify-center"
      >
        {isPending ? (
          <><Loader2 className="size-4 animate-spin" /> Generating...</>
        ) : (
          <><Sparkles className="size-4" /> Generate Ads</>
        )}
      </button>
    </form>
  );
}
