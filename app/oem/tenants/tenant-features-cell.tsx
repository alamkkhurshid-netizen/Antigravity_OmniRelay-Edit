"use client"

import { useState } from "react";
import { toggleGoogleCalendarSync, togglePremiumAgent } from "./actions";

export function TenantFeaturesCell({ 
  organizationId, 
  initialGoogleSync,
  initialSupportAgent,
  initialCtoAgent,
  initialGrowthAgent,
  initialAdminAgent
}: { 
  organizationId: string, 
  initialGoogleSync: boolean,
  initialSupportAgent: boolean,
  initialCtoAgent: boolean,
  initialGrowthAgent: boolean,
  initialAdminAgent: boolean
}) {
  const [googleSync, setGoogleSync] = useState(initialGoogleSync);
  const [supportAgent, setSupportAgent] = useState(initialSupportAgent);
  const [ctoAgent, setCtoAgent] = useState(initialCtoAgent);
  const [growthAgent, setGrowthAgent] = useState(initialGrowthAgent);
  const [adminAgent, setAdminAgent] = useState(initialAdminAgent);
  const [isPending, setIsPending] = useState(false);

  async function handleToggle(type: 'google' | 'support' | 'cto' | 'growth' | 'admin') {
    setIsPending(true);
    
    if (type === 'google') {
      const newValue = !googleSync;
      setGoogleSync(newValue);
      const res = await toggleGoogleCalendarSync(organizationId, newValue);
      if (res?.error) { setGoogleSync(!newValue); alert(res.error); }
    } else if (type === 'support') {
      const newValue = !supportAgent;
      setSupportAgent(newValue);
      const res = await togglePremiumAgent(organizationId, 'support', newValue);
      if (res?.error) { setSupportAgent(!newValue); alert(res.error); }
    } else if (type === 'cto') {
      const newValue = !ctoAgent;
      setCtoAgent(newValue);
      const res = await togglePremiumAgent(organizationId, 'cto', newValue);
      if (res?.error) { setCtoAgent(!newValue); alert(res.error); }
    } else if (type === 'growth') {
      const newValue = !growthAgent;
      setGrowthAgent(newValue);
      const res = await togglePremiumAgent(organizationId, 'growth', newValue);
      if (res?.error) { setGrowthAgent(!newValue); alert(res.error); }
    } else if (type === 'admin') {
      const newValue = !adminAgent;
      setAdminAgent(newValue);
      const res = await togglePremiumAgent(organizationId, 'admin', newValue);
      if (res?.error) { setAdminAgent(!newValue); alert(res.error); }
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
          onChange={() => handleToggle('google')}
          disabled={isPending}
        />
        <div className={`w-8 h-4 rounded-full transition-colors ${googleSync ? 'bg-[#1bc5a8]' : 'bg-slate-700'} relative`}>
          <div className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${googleSync ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-xs font-medium text-slate-300">Google Cal Sync</span>
      </label>

      <label className={`flex items-center gap-2 cursor-pointer transition-opacity ${isPending ? 'opacity-50' : 'opacity-90 hover:opacity-100'}`}>
        <input 
          type="checkbox" 
          className="sr-only" 
          checked={supportAgent} 
          onChange={() => handleToggle('support')}
          disabled={isPending}
        />
        <div className={`w-8 h-4 rounded-full transition-colors ${supportAgent ? 'bg-[#ffb020]' : 'bg-slate-700'} relative`}>
          <div className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${supportAgent ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-xs font-medium text-amber-400">PRO Support Agent</span>
      </label>

      <label className={`flex items-center gap-2 cursor-pointer transition-opacity ${isPending ? 'opacity-50' : 'opacity-90 hover:opacity-100'}`}>
        <input 
          type="checkbox" 
          className="sr-only" 
          checked={ctoAgent} 
          onChange={() => handleToggle('cto')}
          disabled={isPending}
        />
        <div className={`w-8 h-4 rounded-full transition-colors ${ctoAgent ? 'bg-[#ffb020]' : 'bg-slate-700'} relative`}>
          <div className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${ctoAgent ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-xs font-medium text-amber-400">PRO Super CTO</span>
      </label>

      <label className={`flex items-center gap-2 cursor-pointer transition-opacity ${isPending ? 'opacity-50' : 'opacity-90 hover:opacity-100'}`}>
        <input 
          type="checkbox" 
          className="sr-only" 
          checked={growthAgent} 
          onChange={() => handleToggle('growth')}
          disabled={isPending}
        />
        <div className={`w-8 h-4 rounded-full transition-colors ${growthAgent ? 'bg-[#ffb020]' : 'bg-slate-700'} relative`}>
          <div className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${growthAgent ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-xs font-medium text-amber-400">PRO Growth Officer</span>
      </label>

      <label className={`flex items-center gap-2 cursor-pointer transition-opacity ${isPending ? 'opacity-50' : 'opacity-90 hover:opacity-100'}`}>
        <input 
          type="checkbox" 
          className="sr-only" 
          checked={adminAgent} 
          onChange={() => handleToggle('admin')}
          disabled={isPending}
        />
        <div className={`w-8 h-4 rounded-full transition-colors ${adminAgent ? 'bg-[#ffb020]' : 'bg-slate-700'} relative`}>
          <div className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full transition-transform ${adminAgent ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-xs font-medium text-amber-400">PRO Admin Agent</span>
      </label>
    </div>
  );
}
