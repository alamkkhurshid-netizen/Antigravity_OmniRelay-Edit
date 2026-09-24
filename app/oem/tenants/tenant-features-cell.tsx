"use client"

import { useState } from "react";
import { toggleGoogleCalendarSync } from "./actions";

export function TenantFeaturesCell({ 
  organizationId, 
  initialGoogleSync 
}: { 
  organizationId: string, 
  initialGoogleSync: boolean 
}) {
  const [googleSync, setGoogleSync] = useState(initialGoogleSync);
  const [isPending, setIsPending] = useState(false);

  async function handleToggle() {
    const newValue = !googleSync;
    setGoogleSync(newValue);
    setIsPending(true);
    const res = await toggleGoogleCalendarSync(organizationId, newValue);
    if (res?.error) {
      setGoogleSync(!newValue); // revert on error
      alert(res.error);
    }
    setIsPending(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className={`flex items-center gap-2 cursor-pointer transition-opacity ${isPending ? 'opacity-50' : 'opacity-90 hover:opacity-100'}`}>
        <input 
          type="checkbox" 
          className="sr-only" 
          checked={googleSync} 
          onChange={handleToggle}
          disabled={isPending}
        />
        <div className={`w-8 h-4 rounded-full transition-colors ${googleSync ? 'bg-[#1bc5a8]' : 'bg-slate-700'} relative`}>
          <div className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${googleSync ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-xs font-medium text-slate-300">Google Cal Sync</span>
      </label>
    </div>
  );
}
