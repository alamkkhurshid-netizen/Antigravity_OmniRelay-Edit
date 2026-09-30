"use client";

import { FormEvent } from "react";
import { Location, Service, Resource } from "@/app/app/appointments/types";
import { addDays, dateKey, longDate, timeLabel } from "@/app/app/appointments/utils";

interface BookingFormProps {
  locations: Location[];
  services: Service[];
  resources: Resource[];
  customerName: string;
  setCustomerName: (val: string) => void;
  customerPhone: string;
  setCustomerPhone: (val: string) => void;
  customerEmail: string;
  setCustomerEmail: (val: string) => void;
  locationId: string;
  setLocationId: (val: string) => void;
  serviceId: string;
  setServiceId: (val: string) => void;
  resourceId: string;
  setResourceId: (val: string) => void;
  notes: string;
  setNotes: (val: string) => void;
  selectedDate: string;
  setSelectedDate: (val: string) => void;
  selectedSlot: string;
  setSelectedSlot: (val: string) => void;
  chosenService: Service | undefined;
  chosenRules: any[];
  availableSlots: Array<{ iso: string; label: string; period: string }>;
  busy: boolean;
  message: string;
  createAppointment: (e: FormEvent) => void;
  today: string;
}

export function BookingForm({
  locations, services, resources,
  customerName, setCustomerName,
  customerPhone, setCustomerPhone,
  customerEmail, setCustomerEmail,
  locationId, setLocationId,
  serviceId, setServiceId,
  resourceId, setResourceId,
  notes, setNotes,
  selectedDate, setSelectedDate,
  selectedSlot, setSelectedSlot,
  chosenService, chosenRules, availableSlots,
  busy, message, createAppointment, today
}: BookingFormProps) {
  const dateOptions = Array.from({ length: 14 }, (_, index) => new Date(`${addDays(today, index)}T00:00:00+05:30`));

  return (
    <form className="appointment-form" onSubmit={createAppointment}>
      <header><div><span className="app-eyebrow">NEW BOOKING</span><h3>Schedule an appointment</h3></div><span>Asia/Kolkata</span></header>
      <div className="form-grid">
        <label>Customer name<input value={customerName} onChange={(e)=>setCustomerName(e.target.value)} required /></label><label>Mobile number<input value={customerPhone} onChange={(e)=>setCustomerPhone(e.target.value)} placeholder="+91…" /></label>
        <label>Email<input type="email" value={customerEmail} onChange={(e)=>setCustomerEmail(e.target.value)} /></label><label>Location<select value={locationId} onChange={(e)=>{setLocationId(e.target.value);setSelectedSlot("");}} required>{locations.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Service<select value={serviceId} onChange={(e)=>{setServiceId(e.target.value);setSelectedSlot("");}} required>{services.map((item)=><option value={item.id} key={item.id}>{item.name} · {item.duration_minutes} min</option>)}</select></label><label>Provider/resource<select value={resourceId} onChange={(e)=>{setResourceId(e.target.value);setSelectedSlot("");}} required>{resources.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="wide">Notes<input value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Reason, preferences or internal note" /></label>
      </div>
      <section className="date-picker"><header><div><span>SELECT DATE</span><h4>{new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric"}).format(new Date(`${selectedDate}T00:00:00+05:30`))}</h4></div><small>14-day availability</small></header><div className="date-strip">{dateOptions.map((item)=>{const iso=dateKey(item);return <button type="button" className={selectedDate===iso?"selected":""} onClick={()=>{setSelectedDate(iso);setSelectedSlot("");}} key={iso}><span>{new Intl.DateTimeFormat("en-IN",{weekday:"short"}).format(item)}</span><b>{item.getDate()}</b><small>{new Intl.DateTimeFormat("en-IN",{month:"short"}).format(item)}</small></button>})}</div></section>
      <section className="slot-picker"><header><div><span>AVAILABLE TIMES</span><h4>{chosenService?.duration_minutes??0} minute appointment</h4></div><small>{resources.find((item)=>item.id===resourceId)?.name}</small></header>{!chosenRules.length?<p>Closed on this date.</p>:availableSlots.length===0?<p>No times available. Choose another date.</p>:<div className="slot-groups">{(["Morning","Afternoon"] as const).map((period)=>{const group=availableSlots.filter((slot)=>slot.period===period);return group.length>0&&<div key={period}><b>{period}</b><div>{group.map((slot)=><button type="button" className={selectedSlot===slot.iso?"selected":""} onClick={()=>setSelectedSlot(slot.iso)} key={slot.iso}>{slot.label}</button>)}</div></div>})}</div>}</section>
      <div className="booking-confirm"><div><span>Selected appointment</span><b>{selectedSlot?`${longDate(dateKey(new Date(selectedSlot)))} at ${timeLabel(new Date(selectedSlot))}`:"Choose an available time"}</b></div><button className="primary-button" disabled={busy||!selectedSlot}>{busy?"Checking availability…":"Confirm appointment"}</button></div>{message&&<p className="form-message" role="status">{message}</p>}
    </form>
  );
}
