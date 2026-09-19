"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Resource={id:string;name:string};
type Location={id?:string;name:string};
type Service={id?:string;name:string;duration_minutes:number;buffer_minutes?:number;price_paise?:number|null};
type Assignment={id:string;resource_id:string;location_id:string;active:boolean;effective_from:string;effective_to:string|null;booking_window_days:number};
type PaymentMode="pay_at_location"|"full_online"|"deposit_online";
type AssignmentService={assignment_id:string;service_id:string;active:boolean;duration_minutes:number|null;buffer_minutes:number|null;price_paise:number|null;payment_mode:PaymentMode;allowed_payment_modes?:PaymentMode[];deposit_paise:number|null};
type Session={id?:string;resource_id:string;location_id:string|null;weekday:number;start_time:string;end_time:string;slot_interval_minutes:number};

const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const today=new Date().toISOString().slice(0,10);

export function ChamberScheduleEditor({organizationId,resources,locations,services,assignments,assignmentServices,chamberRules,paymentGateway}:{
  organizationId:string;resources:Resource[];locations:Location[];services:Service[];
  assignments:Assignment[];assignmentServices:AssignmentService[];chamberRules:Session[];
  paymentGateway:{provider:string;status:string;account_label:string|null;last_verified_at:string|null}|null;
  calendarConnections?:Array<{resource_id:string|null;expires_at:string}>;
}) {
  const savedLocations=locations.filter((item):item is Location&{id:string}=>Boolean(item.id));
  const [resourceId,setResourceId]=useState(resources[0]?.id??"");
  const [locationId,setLocationId]=useState(savedLocations[0]?.id??"");
  const selected=assignments.find((item)=>item.resource_id===resourceId&&item.location_id===locationId);
  const initialServices=useMemo(()=>services.map((service)=>{
    const row=assignmentServices.find((item)=>item.assignment_id===selected?.id&&item.service_id===service.id);
    return {service_id:service.id??"",active:row?.active??Boolean(selected),duration_minutes:row?.duration_minutes??service.duration_minutes,buffer_minutes:row?.buffer_minutes??service.buffer_minutes??0,price_paise:row?.price_paise??service.price_paise??null,payment_mode:row?.payment_mode??"pay_at_location" as PaymentMode,allowed_payment_modes:row?.allowed_payment_modes?.length?row.allowed_payment_modes:[row?.payment_mode??"pay_at_location"],deposit_paise:row?.deposit_paise??null};
  }),[assignmentServices,selected,services]);
  const initialSessions=useMemo(()=>chamberRules.filter((item)=>item.resource_id===resourceId&&item.location_id===locationId).map((item)=>({...item,start_time:item.start_time.slice(0,5),end_time:item.end_time.slice(0,5)})),[chamberRules,locationId,resourceId]);
  const [active,setActive]=useState(selected?.active??true);
  const [effectiveFrom,setEffectiveFrom]=useState(selected?.effective_from??today);
  const [effectiveTo,setEffectiveTo]=useState(selected?.effective_to??"");
  const [bookingWindow,setBookingWindow]=useState(selected?.booking_window_days??60);
  const [serviceRows,setServiceRows]=useState(initialServices);
  const [sessions,setSessions]=useState<Session[]>(initialSessions);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  function load(resource:string,location:string) {
    const assignment=assignments.find((item)=>item.resource_id===resource&&item.location_id===location);
    setResourceId(resource);setLocationId(location);setActive(assignment?.active??true);
    setEffectiveFrom(assignment?.effective_from??today);setEffectiveTo(assignment?.effective_to??"");
    setBookingWindow(assignment?.booking_window_days??60);
    setServiceRows(services.map((service)=>{
      const row=assignmentServices.find((item)=>item.assignment_id===assignment?.id&&item.service_id===service.id);
      return {service_id:service.id??"",active:row?.active??Boolean(assignment),duration_minutes:row?.duration_minutes??service.duration_minutes,buffer_minutes:row?.buffer_minutes??service.buffer_minutes??0,price_paise:row?.price_paise??service.price_paise??null,payment_mode:row?.payment_mode??"pay_at_location" as PaymentMode,allowed_payment_modes:row?.allowed_payment_modes?.length?row.allowed_payment_modes:[row?.payment_mode??"pay_at_location"],deposit_paise:row?.deposit_paise??null};
    }));
    setSessions(chamberRules.filter((item)=>item.resource_id===resource&&item.location_id===location).map((item)=>({...item,start_time:item.start_time.slice(0,5),end_time:item.end_time.slice(0,5)})));
    setMessage("");
  }
  function patchService(index:number,patch:Partial<(typeof serviceRows)[number]>) {
    setServiceRows((rows)=>rows.map((row,i)=>i===index?{...row,...patch}:row));
  }
  function togglePayment(index:number,mode:PaymentMode) {
    setServiceRows((rows)=>rows.map((row,i)=>{
      if(i!==index)return row;
      const current=row.allowed_payment_modes??[row.payment_mode];
      const allowed=current.includes(mode)?current.filter((item)=>item!==mode):[...current,mode];
      if(!allowed.length)return row;
      const payment_mode:PaymentMode=allowed.includes("pay_at_location")?"pay_at_location":allowed[0];
      return {...row,allowed_payment_modes:allowed,payment_mode,deposit_paise:allowed.includes("deposit_online")?row.deposit_paise:null};
    }));
  }
  function patchSession(index:number,patch:Partial<Session>) {
    setSessions((rows)=>rows.map((row,i)=>i===index?{...row,...patch}:row));
  }
  async function save() {
    if(!resourceId||!locationId){setMessage("Select a provider and saved chamber.");return}
    if(!serviceRows.some((item)=>item.active)){setMessage("Enable at least one service for this chamber.");return}
    if(serviceRows.some((item)=>item.active&&!(item.allowed_payment_modes?.length))){setMessage("Choose at least one payment option for every active service.");return}
    if(serviceRows.some((item)=>item.active&&item.allowed_payment_modes?.includes("deposit_online")&&(!item.deposit_paise||item.deposit_paise<1))){setMessage("Enter a valid online deposit amount.");return}
    if(!sessions.length){setMessage("Add at least one weekly session.");return}
    if(sessions.some((item)=>item.end_time<=item.start_time)){setMessage("Every session must end after it starts.");return}
    setBusy(true);setMessage("");
    try {
      const {data,error}=await createClient().rpc("save_provider_chamber_schedule",{
        p_organization_id:organizationId,p_resource_id:resourceId,p_location_id:locationId,p_active:active,
        p_effective_from:effectiveFrom,p_effective_to:effectiveTo||null,p_booking_window_days:bookingWindow,
        p_services:serviceRows,p_sessions:sessions.map(({weekday,start_time,end_time,slot_interval_minutes})=>({weekday,start_time,end_time,slot_interval_minutes}))
      });
      if(error) throw error;
      if(!data) throw new Error("The chamber schedule was not confirmed. Please try again.");
      setMessage("Chamber schedule saved. Your details remain on screen, and public booking now uses these dates, services, fees and sessions.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the chamber schedule.");
    } finally {
      setBusy(false);
    }
  }

  const paymentsReady=paymentGateway?.status==="test"||paymentGateway?.status==="live";
  const doctorCalendar = calendarConnections?.find(c => c.resource_id === resourceId);

  return <section className="foundation-section chamber-schedule" id="chamber-schedules">
    <header><div><span className="app-eyebrow">DOCTOR–CHAMBER SCHEDULING</span><h2>Set where and when each provider works</h2><p>Each chamber can have its own services, fees, dates and multiple daily sessions.</p></div><span className="section-status">Live booking rules</span></header>
    {!resources.length||!savedLocations.length?<p className="provider-note">Save a provider and at least one chamber before configuring schedules.</p>:<>
      <div className="schedule-context">
        <label>Provider<select value={resourceId} onChange={(e)=>load(e.target.value,locationId)}>{resources.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Chamber<select value={locationId} onChange={(e)=>load(resourceId,e.target.value)}>{savedLocations.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Effective from<input type="date" value={effectiveFrom} onChange={(e)=>setEffectiveFrom(e.target.value)}/></label>
        <label>Effective until<input type="date" min={effectiveFrom} value={effectiveTo} onChange={(e)=>setEffectiveTo(e.target.value)}/></label>
        <label>Booking window<select value={bookingWindow} onChange={(e)=>setBookingWindow(Number(e.target.value))}>{[14,30,60,90,180].map((item)=><option value={item} key={item}>{item} days</option>)}</select></label>
        <label className="assignment-toggle"><input type="checkbox" checked={active} onChange={(e)=>setActive(e.target.checked)}/> Accept bookings at this chamber</label>
      </div>
      <div className="payment-readiness" style={{marginTop: '12px', marginBottom: '12px'}}>
        <div>
          <span>GOOGLE CALENDAR</span>
          <b>{doctorCalendar ? "Doctor Calendar Connected" : "Connect Personal Calendar"}</b>
          <small>{doctorCalendar ? "This provider's appointments sync directly to Google Calendar." : "Sync this specific doctor's appointments to their own Google Calendar."}</small>
        </div>
        {!doctorCalendar ? (
          <a href={`/api/auth/google-calendar?organizationId=${organizationId}&resourceId=${resourceId}`} className="secondary-button" style={{textDecoration: 'none'}}>Connect</a>
        ) : (
          <i className="ready">READY</i>
        )}
      </div>
      <div className="payment-readiness"><div><span>PAYMENT GATEWAY</span><b>{paymentsReady?`${paymentGateway?.account_label||"Razorpay"} connected`:"Pay at clinic is active"}</b><small>{paymentsReady?"Online deposit and full-payment policies are available.":"Online options unlock after Razorpay test credentials are verified."}</small></div><i className={paymentsReady?"ready":""}>{paymentsReady?"READY":"SAFE DEFAULT"}</i></div>
      <div className="chamber-service-list"><h3>Services, pricing and payment policy</h3>{serviceRows.map((row,index)=>{const service=services[index];return <article key={row.service_id}>
        <label className="service-toggle"><input type="checkbox" checked={row.active} onChange={(e)=>patchService(index,{active:e.target.checked})}/><b>{service.name}</b></label>
        <label>Duration<input type="number" min="5" step="5" value={row.duration_minutes} onChange={(e)=>patchService(index,{duration_minutes:Number(e.target.value)})}/><span>min</span></label>
        <label>Buffer<input type="number" min="0" step="5" value={row.buffer_minutes} onChange={(e)=>patchService(index,{buffer_minutes:Number(e.target.value)})}/><span>min</span></label>
        <label>Fee ₹<input type="number" min="0" value={row.price_paise==null?"":row.price_paise/100} onChange={(e)=>patchService(index,{price_paise:e.target.value?Number(e.target.value)*100:null})}/></label>
        <fieldset className="payment-policy"><legend>Patient payment options</legend>
          <label><input type="checkbox" checked={row.allowed_payment_modes?.includes("pay_at_location")} onChange={()=>togglePayment(index,"pay_at_location")}/><span><b>Pay at clinic</b><small>Collect after visit</small></span></label>
          <label className={!paymentsReady?"disabled":""}><input type="checkbox" disabled={!paymentsReady} checked={row.allowed_payment_modes?.includes("full_online")} onChange={()=>togglePayment(index,"full_online")}/><span><b>Full online</b><small>Confirm after payment</small></span></label>
          <label className={!paymentsReady?"disabled":""}><input type="checkbox" disabled={!paymentsReady} checked={row.allowed_payment_modes?.includes("deposit_online")} onChange={()=>togglePayment(index,"deposit_online")}/><span><b>Online deposit</b><small>Balance at clinic</small></span></label>
        </fieldset>
        {row.allowed_payment_modes?.includes("deposit_online")&&<label>Deposit ₹<input type="number" min="1" max={row.price_paise?row.price_paise/100:undefined} value={row.deposit_paise==null?"":row.deposit_paise/100} onChange={(e)=>patchService(index,{deposit_paise:e.target.value?Number(e.target.value)*100:null})}/></label>}
      </article>})}</div>
      <div className="session-editor"><header><div><h3>Weekly sessions</h3><p>Add morning/evening sessions separately. Overlapping work at another chamber is rejected.</p></div><button type="button" className="secondary-button" onClick={()=>setSessions([...sessions,{resource_id:resourceId,location_id:locationId,weekday:1,start_time:"09:00",end_time:"13:00",slot_interval_minutes:15}])}>+ Add session</button></header>
        {sessions.length?<div>{sessions.map((item,index)=><article key={`${item.id??"new"}-${index}`}>
          <select aria-label="Day" value={item.weekday} onChange={(e)=>patchSession(index,{weekday:Number(e.target.value)})}>{days.map((day,i)=><option value={i} key={day}>{day}</option>)}</select>
          <input aria-label="Start time" type="time" value={item.start_time} onChange={(e)=>patchSession(index,{start_time:e.target.value})}/>
          <span>to</span>
          <input aria-label="End time" type="time" value={item.end_time} onChange={(e)=>patchSession(index,{end_time:e.target.value})}/>
          <select aria-label="Slot interval" value={item.slot_interval_minutes} onChange={(e)=>patchSession(index,{slot_interval_minutes:Number(e.target.value)})}>{[10,15,20,30,60].map((minutes)=><option key={minutes} value={minutes}>{minutes} min slots</option>)}</select>
          <button type="button" aria-label="Remove session" onClick={()=>setSessions((rows)=>rows.filter((_,i)=>i!==index))}>×</button>
        </article>)}</div>:<p className="provider-note">No chamber-specific sessions yet. Add the first session; until then the legacy provider hours remain the fallback.</p>}
      </div>
      <div className="schedule-save"><span>Changes affect new availability immediately. Existing appointments remain intact.</span><button type="button" className="primary-button" onClick={save} disabled={busy}>{busy?"Validating schedule…":"Save chamber schedule"}</button></div>
      {message&&<p className="form-message" role="status">{message}</p>}
    </>}
  </section>;
}
