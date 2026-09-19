"use client";

import { Calculator, CircleHelp, MessageCircleMore, Plus, UsersRound, X } from "lucide-react";
import { useState } from "react";

type Rate = { message_category:string; base_rate_paise:number|string; platform_fee_paise:number|string; source_version:string; verification_status?:"draft"|"verified" };
type Tier = { name:string; utility:number; marketing:number };
const WORKING_DAYS=26;
const money=(paise:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",minimumFractionDigits:2}).format(paise/100);
const tierFor=(utilityBase:number):Tier=>utilityBase<=200000?{name:"Starter",utility:25,marketing:22}:utilityBase<=1000000?{name:"Growth",utility:20,marketing:20}:utilityBase<=3000000?{name:"Scale",utility:15,marketing:19}:{name:"Enterprise",utility:10,marketing:18};

function InfoButton({id,label,active,onToggle,placement}:{id:string;label:string;active:string|null;onToggle:(id:string)=>void;placement?:"top"}) {
  const open=active===id;
  return <span className={`wa-info-wrap${placement==="top"?" wa-info-wrap-top":""}`}><button type="button" className="wa-info-button" onClick={()=>onToggle(id)} aria-label={label} aria-expanded={open}><CircleHelp className="size-3.5"/></button>{open&&<span className="wa-info-popover" role="tooltip">{label}</span>}</span>;
}

export function WhatsAppCostCalculator({rates,variant="hero"}:{rates:Rate[];variant?:"hero"|"header"}) {
  const [open,setOpen]=useState(false);
  const [patientsPerDay,setPatientsPerDay]=useState(20);
  const [doctors,setDoctors]=useState(1);
  const [campaignAudience,setCampaignAudience]=useState(0);
  const [campaigns,setCampaigns]=useState(1);
  const [followUpPatients,setFollowUpPatients]=useState(0);
  const [medicationMessages,setMedicationMessages]=useState(0);
  const [continuedCareOpen,setContinuedCareOpen]=useState(false);
  const [activeInfo,setActiveInfo]=useState<string|null>(null);
  const rate=(category:string)=>rates.find(item=>item.message_category===category);
  const rateValue=(category:string)=>{const item=rate(category);return Number(item?.base_rate_paise??0)+Number(item?.platform_fee_paise??0)};
  const utility=rateValue("utility"); const marketing=rateValue("marketing");
  const available=Boolean(rate("utility")&&rate("marketing"));
  const monthlyVisits=patientsPerDay*doctors*WORKING_DAYS; const coreBookingMessages=monthlyVisits*3;
  const utilityMessages=coreBookingMessages+followUpPatients+medicationMessages;
  const utilityBase=utilityMessages*utility; const tier=tierFor(utilityBase);
  const utilityTotal=Math.round(utilityBase*(1+tier.utility/100));
  const marketingTotal=Math.round(campaignAudience*campaigns*marketing*(1+tier.marketing/100));
  const beforeTax=utilityTotal+marketingTotal; const indicativeTax=Math.round(beforeTax*.18);
  const isDraft=rates.some(item=>item.verification_status!=="verified");
  const number=(value:string,set:(next:number)=>void)=>set(Math.max(0,Number(value)||0));
  return <><button type="button" onClick={()=>setOpen(true)} aria-label="Open WABA Calc" className={`wa-calculator-trigger${variant==="header"?" wa-calculator-header-trigger":""}`}><Calculator className="size-4"/><span>WABA Calc</span></button>
    {open&&<div className="wa-calculator-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}><section className="wa-calculator-modal" role="dialog" aria-modal="true" aria-labelledby="wa-calculator-title" onMouseDown={event=>event.stopPropagation()}>
      <header><div><span className="app-eyebrow">WABA COST PLANNER</span><h2 id="wa-calculator-title">Plan a typical OPD month</h2><p>We use 26 working days for a six-day clinic week. Change the key inputs below.</p></div><button type="button" className="grid size-11 min-h-[44px] min-w-[44px] place-items-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors" onClick={()=>setOpen(false)} aria-label="Close WABA Calc"><X className="size-5"/></button></header>
      <div className="wa-calculator-content">
        <div className="wa-calculator-inputs wa-calculator-inputs-opd">
          <label><span><UsersRound className="size-4"/>Patients per doctor / day <InfoButton id="patients" label="Average number of patients one doctor sees on a normal working day. OmniRelay multiplies this by doctors available and 26 working days." active={activeInfo} onToggle={id=>setActiveInfo(activeInfo===id?null:id)}/></span><input inputMode="numeric" type="number" min="0" value={patientsPerDay} onChange={event=>number(event.target.value,setPatientsPerDay)}/><small>Average flow for one available doctor</small></label>
          <label><span><UsersRound className="size-4"/>Doctors available <InfoButton id="doctors" label="Each available doctor adds the entered daily patient flow to the estimate. Two doctors at 20 patients each means 40 expected patients per working day." active={activeInfo} onToggle={id=>setActiveInfo(activeInfo===id?null:id)}/></span><input inputMode="numeric" type="number" min="0" value={doctors} onChange={event=>number(event.target.value,setDoctors)}/><small>Multiplies expected patient volume</small></label>
          <label><span><MessageCircleMore className="size-4"/>Marketing audience <InfoButton id="audience" label="Only consented contacts receiving one approved marketing template." active={activeInfo} onToggle={id=>setActiveInfo(activeInfo===id?null:id)}/></span><input inputMode="numeric" type="number" min="0" value={campaignAudience} onChange={event=>number(event.target.value,setCampaignAudience)}/><small>Consented contacts per campaign</small></label>
          <label><span><MessageCircleMore className="size-4"/>Campaigns per month <InfoButton id="campaigns" label="Number of separate marketing sends planned this month. Use zero when marketing is off." active={activeInfo} onToggle={id=>setActiveInfo(activeInfo===id?null:id)}/></span><input inputMode="numeric" type="number" min="0" value={campaigns} onChange={event=>number(event.target.value,setCampaigns)}/><small>Set zero when no marketing is planned</small></label>
        </div>
        <div className="wa-continued-care-row"><button type="button" className="wa-continued-care-toggle min-h-[44px]" onClick={()=>setContinuedCareOpen(!continuedCareOpen)}><Plus className={`size-4 ${continuedCareOpen?"rotate-45":""}`}/>Add continued-care messages</button><InfoButton id="care" label="Follow-up and medication reminders are optional. They are not assumed for every visit because the clinical plan and medicine schedule vary by patient." active={activeInfo} onToggle={id=>setActiveInfo(activeInfo===id?null:id)}/></div>
        {continuedCareOpen&&<div className="wa-calculator-inputs wa-continued-care-inputs">
          <label><span>Follow-up patients / month <InfoButton id="followup" label="Adds one scheduled follow-up reminder for each patient entered. Enter only patients whose clinician has set a follow-up date." active={activeInfo} onToggle={id=>setActiveInfo(activeInfo===id?null:id)}/></span><input inputMode="numeric" type="number" min="0" value={followUpPatients} onChange={event=>number(event.target.value,setFollowUpPatients)}/><small>One follow-up reminder per selected patient</small></label>
          <label><span>Medication reminders / month <InfoButton id="medication" label="Enter the total medication reminder messages planned for the month. This varies by dose frequency and duration, so OmniRelay does not guess it." active={activeInfo} onToggle={id=>setActiveInfo(activeInfo===id?null:id)}/></span><input inputMode="numeric" type="number" min="0" value={medicationMessages} onChange={event=>number(event.target.value,setMedicationMessages)}/><small>Enter the total scheduled messages</small></label>
        </div>}
        <div className="wa-calculator-summary"><span>{monthlyVisits.toLocaleString("en-IN")} expected visits · {utilityMessages.toLocaleString("en-IN")} utility messages <InfoButton id="core" label="Each booked visit includes one booking confirmation, one 24-hour reminder and one 2-hour reminder. Follow-up and medication reminders are added only when you enter them above." active={activeInfo} onToggle={id=>setActiveInfo(activeInfo===id?null:id)}/></span><span>{patientsPerDay} per doctor · {doctors} doctor{doctors===1?"":"s"} · {WORKING_DAYS} days</span></div>
        <div className="wa-calculator-breakdown"><span>Core booking messages <b>{coreBookingMessages.toLocaleString("en-IN")}</b></span><span>Continued-care messages <b>{(followUpPatients+medicationMessages).toLocaleString("en-IN")}</b></span><span>Marketing messages <b>{(campaignAudience*campaigns).toLocaleString("en-IN")}</b></span></div>
        <div className="wa-calculator-total"><span>Indicative monthly operational cost <InfoButton id="total" label="The estimate combines utility messages for booking and any continued care you add, plus optional consented marketing messages and indicative GST. It excludes the SaaS subscription and is not an invoice." active={activeInfo} onToggle={id=>setActiveInfo(activeInfo===id?null:id)}/></span><b>{available?money(beforeTax+indicativeTax):"Planning rates pending"}</b><small>{available?`${money(beforeTax)} before indicative 18% GST · Rate card is planning only`:"No charge is being made. An owner must add the planning rate card before estimates appear."}</small></div>
      </div>
      <footer><span>{isDraft?"Planning rate card: reconcile against Meta’s published India rate card before billing activation.":"Estimate only. Free service-window and eligible ad-entry messages reconcile after delivery."} <InfoButton id="rate-card" label="This is a planning-only India rate card. It cannot debit a wallet, create an invoice, block a send, or charge the clinic." active={activeInfo} onToggle={id=>setActiveInfo(activeInfo===id?null:id)} placement="top"/></span><button type="button" className="min-h-[44px] min-w-[84px] rounded-xl font-bold bg-[#087f91] text-white px-4 cursor-pointer" onClick={()=>setOpen(false)}>Done</button></footer>
    </section></div>}
  </>;
}
