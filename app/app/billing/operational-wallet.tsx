"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Usage = { id:string; source_type:string; message_category:string; delivery_status:string; estimated_total_paise:number; occurred_at:string; metadata:Record<string, unknown> };
type Rate = { message_category:string; base_rate_paise:number; platform_fee_paise:number; source_version:string };

const money=(paise:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",minimumFractionDigits:2}).format(paise/100);

export function OperationalWallet({business,usage,rates}:{business:string;usage:Usage[];rates:Rate[]}) {
  const router=useRouter();
  const [reminders,setReminders]=useState(100);
  const [confirmations,setConfirmations]=useState(100);
  const [campaigns,setCampaigns]=useState(0);
  const [images,setImages]=useState(0);
  useEffect(()=>{const id=window.setInterval(()=>router.refresh(),30000);return()=>window.clearInterval(id)},[router]);
  const totals=useMemo(()=>usage.reduce((acc,item)=>{acc[item.message_category]=(acc[item.message_category]??0)+item.estimated_total_paise;return acc},{} as Record<string,number>),[usage]);
  const rate=(category:string)=>rates.find(item=>item.message_category===category);
  const utility=(rate("utility")?.base_rate_paise??0)+(rate("utility")?.platform_fee_paise??0);
  const marketing=(rate("marketing")?.base_rate_paise??0)+(rate("marketing")?.platform_fee_paise??0);
  const calculator=(reminders+confirmations)*utility+campaigns*marketing;
  const configured=rates.length>0;
  return <section className="operational-wallet" aria-label="Operational wallet pilot dashboard">
    <header><div><span className="app-eyebrow">OPERATIONAL WALLET</span><h2>Usage pilot — no clinic is being charged</h2><p>{business} is recording WhatsApp usage for reconciliation. Wallet debits, automatic top-ups and send blocking remain disabled until the one-clinic pilot closes successfully.</p></div><b>SHADOW MODE</b></header>
    <div className="wallet-summary">
      <article><span>Estimated usage this month</span><b>{money(Object.values(totals).reduce((sum,value)=>sum+value,0))}</b><small>{usage.length} chargeable-message observations</small></article>
      <article><span>Utility communication</span><b>{money(totals.utility??0)}</b><small>Confirmations, reminders and care messages</small></article>
      <article><span>Marketing communication</span><b>{money(totals.marketing??0)}</b><small>Campaign messages only</small></article>
      <article><span>Wallet balance</span><b>{money(0)}</b><small>Pilot mode: no funds collected or deducted</small></article>
    </div>
    <div className="billing-ledger operational-grid">
      <article className="calculator-card"><span>COST CALCULATOR</span><h3>Estimate a typical month</h3><p>Use your expected message volume. These figures become monetary estimates only after the official Meta India rate card is reviewed and activated.</p>
        <div className="calculator-fields">
          <label>Appointment confirmations<input className="min-h-[44px] text-base sm:text-sm" type="number" min="0" value={confirmations} onChange={event=>setConfirmations(Math.max(0,Number(event.target.value)||0))}/></label>
          <label>Appointment reminders<input className="min-h-[44px] text-base sm:text-sm" type="number" min="0" value={reminders} onChange={event=>setReminders(Math.max(0,Number(event.target.value)||0))}/></label>
          <label>Campaign recipients<input className="min-h-[44px] text-base sm:text-sm" type="number" min="0" value={campaigns} onChange={event=>setCampaigns(Math.max(0,Number(event.target.value)||0))}/></label>
          <label>AI images<input className="min-h-[44px] text-base sm:text-sm" type="number" min="0" value={images} onChange={event=>setImages(Math.max(0,Number(event.target.value)||0))}/></label>
        </div>
        <div className="calculator-result"><span>Estimated messaging usage</span><b>{configured?money(calculator):"Rate card pending"}</b><small>{images?"AI creative pricing will be added only after a pre-authorised price model is approved.":"AI creative is not included in this pilot estimate."}</small></div>
      </article>
      <article><span>RECENT USAGE PASSBOOK</span><h3>{usage.length?"Latest observed messages":"No observed messages yet"}</h3>{usage.length?usage.slice(0,6).map(item=><div className="billing-row flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3.5 bg-slate-50 sm:bg-transparent rounded-xl sm:rounded-none border border-slate-100 sm:border-0" key={item.id}><div className="min-w-0"><b className="text-sm text-slate-900">{item.message_category} message</b><small className="block text-xs text-slate-500 mt-0.5">{item.source_type.replaceAll("_"," ")} · {new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}).format(new Date(item.occurred_at))}</small></div><div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60"><span className="font-bold text-slate-800 text-sm">{item.metadata.rate_status==="unconfigured"?"Rate pending":money(item.estimated_total_paise)}</span><i className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${item.delivery_status}`}>{item.delivery_status}</i></div></div>):<p>Once a pilot message is sent, it will appear here without patient names or message content.</p>}</article>
    </div>
  </section>
}
