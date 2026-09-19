"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";

type Service = { id:string; name:string; description:string|null; duration_minutes:number; buffer_minutes:number; price_paise:number|null; currency:string };
type Location = { id:string; name:string; type:string; address:Record<string,string>; phone:string|null; timezone:string };
type Resource = { id:string; name:string; type:string; location_id:string|null; timezone:string; photo_path:string|null; specialization:string|null; qualifications:string|null; experience_years:number|null; languages:string[]; biography:string|null };
type Department={id:string;name:string;description:string|null};
type ProviderDepartment={department_id:string;resource_id:string;primary_department:boolean};
type PaymentMode="pay_at_location"|"full_online"|"deposit_online";
type AssignmentService={service_id:string;duration_minutes:number;buffer_minutes:number;price_paise:number|null;payment_mode:PaymentMode;allowed_payment_modes?:PaymentMode[];deposit_paise:number|null};
type Assignment={id:string;resource_id:string;location_id:string;effective_from:string;effective_to:string|null;booking_window_days:number;services:AssignmentService[]};
type BookingPage = { slug:string; headline:string; description:string; accent_color:string; clinic_mode?:"solo_practitioner"|"multi_doctor_clinic"|"diagnostic_centre"; departments?:Department[]; provider_departments?:ProviderDepartment[]; business:{name:string;category:string;phone:string;email:string;timezone:string}; services:Service[]; locations:Location[]; resources:Resource[]; assignments:Assignment[] };
type Slot = { starts_at:string; label:string; resource_id?:string };
type Confirmation = { booking_reference:string; manage_token:string; starts_at:string; ends_at:string };
type CheckoutOrder={key_id:string;order_id:string;amount:number;currency:string;booking_reference:string;manage_token:string;expires_at:string;starts_at:string;ends_at:string};
type RazorpayResult={razorpay_order_id:string;razorpay_payment_id:string;razorpay_signature:string};
type PatientRelationship="self"|"child"|"parent"|"spouse"|"relative"|"other";
type BookingDetails={name:string;phone:string;email:string;notes:string;age:string;healthConcern:string;locality:string;pincode:string;summary:string;careConsent:boolean;marketingConsent:boolean;contactName:string;contactPhone:string;relationship:PatientRelationship;dateOfBirth:string};
type RazorpayOptions={key:string;amount:number;currency:string;order_id:string;name:string;description:string;prefill:{name:string;email:string;contact:string};theme:{color:string};handler:(result:RazorpayResult)=>void;modal:{ondismiss:()=>void}};
type InitialSelection={serviceId:string;locationId:string;resourceId:string;date:string;slot:string;source:string;handoffToken?:string;patientName?:string;bookingContactName?:string;bookingContactPhone?:string;relationship?:PatientRelationship};
type OtpStatus={available:boolean};

declare global { interface Window { Razorpay?:new(options:RazorpayOptions)=>{open:()=>void}; } }

function dateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value);
  const pick=(type:string)=>parts.find((item)=>item.type===type)?.value??"";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
function addressText(address:Record<string,string>) {
  return Object.values(address??{}).filter(Boolean).join(", ") || "Address available on confirmation";
}
function appointmentLabel(value:string,timeZone:string) {
  return new Intl.DateTimeFormat("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true,timeZone}).format(new Date(value));
}

export function BookingConcierge({ page, initialSelection }: { page: BookingPage; initialSelection?:InitialSelection }) {
  const today=dateKey(new Date());
  const requestedAssignment=page.assignments.find((item)=>item.resource_id===initialSelection?.resourceId&&item.location_id===initialSelection?.locationId&&item.services.some((service)=>service.service_id===initialSelection?.serviceId));
  const initialServiceId=requestedAssignment?initialSelection?.serviceId??"":page.services[0]?.id??"";
  const [serviceId,setServiceId]=useState(initialServiceId);
  const eligibleAssignments=useMemo(()=>page.assignments.filter((item)=>item.services.some((service)=>service.service_id===serviceId)),[page.assignments,serviceId]);
  const eligibleLocations=useMemo(()=>page.locations.filter((item)=>eligibleAssignments.some((assignment)=>assignment.location_id===item.id)),[eligibleAssignments,page.locations]);
  const [locationId,setLocationId]=useState(requestedAssignment?initialSelection?.locationId??"":eligibleLocations[0]?.id??"");
  const multiDoctor=page.clinic_mode==="multi_doctor_clinic"&&(page.departments?.length??0)>0;
  const eligibleDepartmentIds=useMemo(()=>new Set((page.provider_departments??[]).filter((link)=>eligibleAssignments.some((assignment)=>assignment.location_id===locationId&&assignment.resource_id===link.resource_id)).map((link)=>link.department_id)),[eligibleAssignments,locationId,page.provider_departments]);
  const availableDepartments=useMemo(()=>multiDoctor?(page.departments??[]).filter((item)=>eligibleDepartmentIds.has(item.id)):[],[eligibleDepartmentIds,multiDoctor,page.departments]);
  const [departmentId,setDepartmentId]=useState(availableDepartments[0]?.id??"");
  const availableResources=useMemo(()=>page.resources.filter((item)=>eligibleAssignments.some((assignment)=>assignment.location_id===locationId&&assignment.resource_id===item.id)&&(!multiDoctor||!departmentId||(page.provider_departments??[]).some((link)=>link.department_id===departmentId&&link.resource_id===item.id))),[departmentId,eligibleAssignments,locationId,multiDoctor,page.provider_departments,page.resources]);
  const [resourceId,setResourceId]=useState(requestedAssignment?initialSelection?.resourceId??"":availableResources[0]?.id??"");
  const anyProvider=multiDoctor&&resourceId==="any";
  const requestedDate=/^\d{4}-\d{2}-\d{2}$/.test(initialSelection?.date??"")&&(initialSelection?.date??"")>=today?initialSelection?.date??today:today;
  const [date,setDate]=useState(requestedDate);
  const [slots,setSlots]=useState<Slot[]>([]);
  const [slot,setSlot]=useState(initialSelection?.slot??"");
  const [loadingSlots,setLoadingSlots]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [relationship,setRelationship]=useState<PatientRelationship>(initialSelection?.relationship??"self");
  const [confirmation,setConfirmation]=useState<Confirmation|null>(null);
  const [otpAvailable,setOtpAvailable]=useState(false);
  const [otpChallengeId,setOtpChallengeId]=useState("");
  const [otpCode,setOtpCode]=useState("");
  const [otpVerificationToken,setOtpVerificationToken]=useState("");
  const [otpVerifiedPhone,setOtpVerifiedPhone]=useState("");
  const [otpRequestedPhone,setOtpRequestedPhone]=useState("");
  const dates=Array.from({length:14},(_,index)=>{const value=new Date(`${today}T00:00:00+05:30`);value.setDate(value.getDate()+index);return value;});
  const service=page.services.find((item)=>item.id===serviceId);
  const resolvedResourceId=slot&&anyProvider?slots.find((item)=>item.starts_at===slot)?.resource_id??"":resourceId;
  const selectedAssignment=page.assignments.find((item)=>item.location_id===locationId&&item.resource_id===resolvedResourceId);
  const selectedService=selectedAssignment?.services.find((item)=>item.service_id===serviceId);
  const location=page.locations.find((item)=>item.id===locationId);
  const resource=page.resources.find((item)=>item.id===resolvedResourceId);
  const allowedPaymentModes=selectedService?.allowed_payment_modes?.length?selectedService.allowed_payment_modes:selectedService?[selectedService.payment_mode]:["pay_at_location" as PaymentMode];
  const [selectedPaymentMode,setSelectedPaymentMode]=useState<PaymentMode>("pay_at_location");
  const activePaymentMode=allowedPaymentModes.includes(selectedPaymentMode)?selectedPaymentMode:(allowedPaymentModes[0]??"pay_at_location");

  useEffect(()=>{
    if(!serviceId||!locationId||!resourceId)return;
    let active=true;
    const loadingTimer=window.setTimeout(()=>{if(active)setLoadingSlots(true)},0);
    const providerIds=resourceId==="any"?availableResources.map((item)=>item.id):[resourceId];
    Promise.all(providerIds.map((providerId)=>createClient().rpc("get_public_booking_slots",{p_slug:page.slug,p_service_id:serviceId,p_location_id:locationId,p_resource_id:providerId,p_date:date}).then(({data,error})=>({providerId,data:(data as Slot[])??[],error})))).then((results)=>{if(!active)return;const firstError=results.find((item)=>item.error)?.error;const merged=results.flatMap((item)=>item.data.map((slot)=>({...slot,resource_id:item.providerId}))).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).filter((item,index,all)=>index===all.findIndex((candidate)=>candidate.starts_at===item.starts_at));setSlots(merged);setSlot((current)=>merged.some((item)=>item.starts_at===current)?current:"");if(firstError)setMessage(firstError.message);setLoadingSlots(false)});
    return()=>{active=false;window.clearTimeout(loadingTimer)};
  },[availableResources,date,locationId,page.slug,resourceId,serviceId]);

  useEffect(()=>{fetch(`/api/public-booking/otp/status?slug=${encodeURIComponent(page.slug)}`,{cache:"no-store"}).then((response)=>response.json()).then((result:OtpStatus)=>setOtpAvailable(result.available)).catch(()=>setOtpAvailable(false))},[page.slug]);

  async function requestOtp(phone:string){
    const response=await fetch("/api/public-booking/otp/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({slug:page.slug,phone})});
    const result=await response.json() as {challenge_id?:string;error?:string};if(!response.ok||!result.challenge_id)throw new Error(result.error||"Unable to send WhatsApp code");
    setOtpChallengeId(result.challenge_id);setOtpCode("");setOtpVerificationToken("");setOtpVerifiedPhone("");setOtpRequestedPhone(phone.replace(/\D/g,""));setMessage("We sent a 6-digit verification code to your WhatsApp number. Enter it below, then submit again.");
  }
  async function verifyOtp(){
    setBusy(true);setMessage("");const response=await fetch("/api/public-booking/otp/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({challenge_id:otpChallengeId,code:otpCode})});
    const result=await response.json() as {ok?:boolean;verification_token?:string;error?:string};if(!response.ok||!result.ok||!result.verification_token){setMessage(result.error||"Incorrect verification code");setBusy(false);return}
    setOtpVerificationToken(result.verification_token);setOtpVerifiedPhone(otpRequestedPhone);setMessage("WhatsApp number verified. Submit the booking to continue.");setBusy(false);
  }
  async function consumeOtp(reference:string,manageToken:string){
    if(!otpAvailable)return;const response=await fetch("/api/public-booking/otp/consume",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({challenge_id:otpChallengeId,verification_token:otpVerificationToken,booking_reference:reference,manage_token:manageToken})});
    const result=await response.json() as {ok?:boolean;error?:string};if(!response.ok||!result.ok)throw new Error(result.error||"Unable to attach phone verification");
  }

  async function loadRazorpay() {
    if(window.Razorpay)return;
    await new Promise<void>((resolve,reject)=>{
      const existing=document.querySelector<HTMLScriptElement>('script[data-omnirelay-razorpay]');
      if(existing){existing.addEventListener("load",()=>resolve(),{once:true});existing.addEventListener("error",()=>reject(new Error("Unable to load secure checkout")),{once:true});return}
      const script=document.createElement("script");script.src="https://checkout.razorpay.com/v1/checkout.js";script.async=true;script.dataset.omnirelayRazorpay="true";
      script.onload=()=>resolve();script.onerror=()=>reject(new Error("Unable to load secure checkout"));document.head.appendChild(script);
    });
  }
  async function attachIdentity(reference:string,token:string,details:BookingDetails) {
    const response=await fetch("/api/public-booking/manage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"identity",reference,token,booking_contact_name:details.contactName,booking_contact_phone:details.contactPhone,patient_relationship:details.relationship,patient_date_of_birth:details.dateOfBirth||null})});
    if(!response.ok){const result=await response.json() as {error?:string};throw new Error(result.error||"Unable to attach booking identity");}
  }
  async function startOnlinePayment(details:BookingDetails) {
    const orderResponse=await fetch("/api/payments/order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      slug:page.slug,resource_id:resolvedResourceId,location_id:locationId,service_id:serviceId,starts_at:slot,
      customer_name:details.name,customer_phone:details.phone,customer_email:details.email,notes:details.notes,
      age:details.age,health_concern:details.healthConcern,locality:details.locality,pincode:details.pincode,summary:details.summary,
      care_communications_consent:details.careConsent,marketing_consent:details.marketingConsent,
      selected_payment_mode:activePaymentMode,handoff_token:initialSelection?.handoffToken,
      booking_contact_name:details.contactName,booking_contact_phone:details.contactPhone,
      patient_relationship:details.relationship,patient_date_of_birth:details.dateOfBirth||null,
    })});
    const order=await orderResponse.json() as CheckoutOrder&{error?:string};
    if(!orderResponse.ok)throw new Error(order.error||"Unable to reserve the appointment");
    if(!initialSelection?.handoffToken){await attachIdentity(order.booking_reference,order.manage_token,details);await consumeOtp(order.booking_reference,order.manage_token);}
    await loadRazorpay();
    if(!window.Razorpay)throw new Error("Secure checkout is unavailable");
    const checkout=new window.Razorpay({
      key:order.key_id,amount:order.amount,currency:order.currency,order_id:order.order_id,
      name:page.business.name,description:`${service?.name??"Appointment"} · ${location?.name??"Clinic"}`,
      prefill:{name:details.name,email:details.email,contact:details.phone},theme:{color:page.accent_color||"#177dff"},
      modal:{ondismiss:()=>{setBusy(false);setMessage(`Payment not completed. Your slot is held until ${new Intl.DateTimeFormat("en-IN",{hour:"numeric",minute:"2-digit",timeZone:"Asia/Kolkata"}).format(new Date(order.expires_at))}.`)}},
      handler:async(result)=>{
        try {
          const verifyResponse=await fetch("/api/payments/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...result,booking_reference:order.booking_reference,manage_token:order.manage_token})});
          const verified=await verifyResponse.json() as Confirmation&{error?:string};
          if(!verifyResponse.ok)throw new Error(verified.error||"Payment verification failed");
          if(initialSelection?.handoffToken){const handoffResponse=await fetch("/api/public-booking/whatsapp-handoff",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"complete",handoff_token:initialSelection.handoffToken,booking_reference:order.booking_reference,manage_token:order.manage_token})});if(!handoffResponse.ok){const handoffError=await handoffResponse.json();throw new Error(handoffError.error||"Payment completed, but WhatsApp confirmation failed");}}
          setConfirmation({...verified,booking_reference:order.booking_reference,manage_token:order.manage_token,starts_at:order.starts_at,ends_at:order.ends_at});
          setBusy(false);
        } catch(error) {setMessage(error instanceof Error?error.message:"Payment verification failed");setBusy(false)}
      },
    });
    checkout.open();
  }
  async function confirm(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!slot)return;setBusy(true);setMessage("");
    const form=new FormData(e.currentTarget);
    const patientPhone=relationship==="self"?String(form.get("contact_phone")??""):String(form.get("patient_phone")??"");
    const details:BookingDetails={
      name:String(form.get("name")??""),phone:patientPhone||String(form.get("contact_phone")??""),email:String(form.get("email")??""),notes:String(form.get("notes")??""),
      age:String(form.get("age")??""),healthConcern:String(form.get("health_concern")??""),locality:String(form.get("locality")??""),
      pincode:String(form.get("pincode")??""),summary:String(form.get("summary")??""),
      careConsent:true,marketingConsent:form.get("marketing_consent")==="on",
      contactName:String(form.get("contact_name")??""),contactPhone:String(form.get("contact_phone")??""),relationship,dateOfBirth:String(form.get("date_of_birth")??""),
    };
    const contactDigits=details.contactPhone.replace(/\D/g,"");
    if(!initialSelection?.handoffToken&&otpAvailable&&(!otpVerificationToken||otpVerifiedPhone!==contactDigits)){
      try{await requestOtp(details.contactPhone)}catch(error){setMessage(error instanceof Error?error.message:"Unable to send WhatsApp code")}setBusy(false);return;
    }
    if(activePaymentMode==="full_online"||activePaymentMode==="deposit_online"){
      try{await startOnlinePayment(details)}catch(error){setMessage(error instanceof Error?error.message:"Unable to start payment");setBusy(false)}
      return;
    }
    if(initialSelection?.handoffToken){
      const response=await fetch("/api/public-booking/whatsapp-handoff",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        handoff_token:initialSelection.handoffToken,slug:page.slug,resource_id:resolvedResourceId,location_id:locationId,service_id:serviceId,starts_at:slot,
        customer_name:details.name,customer_phone:details.phone,customer_email:details.email,notes:details.notes,
        booking_contact_name:details.contactName,booking_contact_phone:details.contactPhone,patient_relationship:details.relationship,patient_date_of_birth:details.dateOfBirth||null,
        intake:{age:details.age,health_concern:details.healthConcern,locality:details.locality,pincode:details.pincode,summary:details.summary,care_communications_consent:details.careConsent,marketing_consent:details.marketingConsent}
      })});
      const result=await response.json() as Confirmation&{error?:string};
      if(!response.ok){setMessage(result.error||"Unable to complete WhatsApp booking");setBusy(false);return}
      setConfirmation(result);setBusy(false);return;
    }
    const {data,error}=await createClient().rpc("create_public_appointment_v2",{
      p_slug:page.slug,p_resource_id:resolvedResourceId,p_location_id:locationId,p_service_id:serviceId,p_starts_at:slot,
      p_customer_name:details.name,p_customer_phone:details.phone,p_customer_email:details.email,p_notes:details.notes,
      p_intake:{age:details.age,health_concern:details.healthConcern,locality:details.locality,pincode:details.pincode,summary:details.summary,care_communications_consent:details.careConsent,marketing_consent:details.marketingConsent}
    });
    if(error){setMessage(error.message);setBusy(false);return}
    try { const result=data as Confirmation;await attachIdentity(result.booking_reference,result.manage_token,details);await consumeOtp(result.booking_reference,result.manage_token);setConfirmation(result); }
    catch(identityError){setMessage(identityError instanceof Error?identityError.message:"Unable to save patient identity");setBusy(false);return}
    setBusy(false);
  }

  if(confirmation) {
    const manageUrl=`/booking/manage?reference=${encodeURIComponent(confirmation.booking_reference)}&token=${encodeURIComponent(confirmation.manage_token)}`;
    return <main className="booking-public"><header><Brand/><span>{page.business.category} · secure booking</span></header><section className="booking-success"><i>✓</i><span>APPOINTMENT CONFIRMED</span><h1>You’re booked.</h1><p>Your appointment with {page.business.name} is confirmed.</p><div><b>{new Intl.DateTimeFormat("en-IN",{weekday:"long",day:"numeric",month:"long",hour:"numeric",minute:"2-digit",timeZone:"Asia/Kolkata"}).format(new Date(confirmation.starts_at))}</b><span>{service?.name} · {location?.name} · {resource?.name}</span></div>{selectedPaymentMode==="pay_at_location"&&selectedService?.price_paise!=null?<div className="payment-due"><small>PAYMENT</small><b>₹{(selectedService.price_paise/100).toLocaleString("en-IN")} due at the clinic</b><span>No online payment was taken.</span></div>:<div className="payment-due paid"><small>PAYMENT VERIFIED</small><b>{selectedPaymentMode==="deposit_online"?`₹${((selectedService?.deposit_paise??0)/100).toLocaleString("en-IN")} deposit received`:"Full payment received"}</b><span>{selectedPaymentMode==="deposit_online"&&selectedService?.price_paise!=null?`₹${((selectedService.price_paise-(selectedService.deposit_paise??0))/100).toLocaleString("en-IN")} balance is due at the clinic.`:"Your appointment was confirmed after secure verification."}</span></div>}<small>Booking reference</small><strong>{confirmation.booking_reference}</strong><a href={manageUrl}>Manage this appointment</a><em>Save the management link. It securely allows rescheduling or cancellation without an account.</em></section></main>;
  }

  return <main className="booking-public" style={{"--booking-accent":page.accent_color} as React.CSSProperties}>
    <header><Brand/><span>{page.business.category} · secure booking</span></header>
    <section className="booking-intro"><div><span>{page.business.category} · Online booking</span><h1>{page.headline}</h1><p>{page.description}</p>{initialSelection?.source==="whatsapp"&&<strong className="whatsapp-handoff-note">✓ Your WhatsApp selections are ready. Confirm patient details and payment below.</strong>}</div><aside><small>Booking with</small><b>{page.business.name}</b><span>Live availability · Asia/Kolkata</span></aside></section>
    <form className="concierge-card" onSubmit={confirm}>
      <section><header><i>1</i><div><b>Choose a service</b><span>What would you like to book?</span></div></header><div className="concierge-options service-options">{page.services.filter((item)=>page.assignments.some((assignment)=>assignment.services.some((row)=>row.service_id===item.id))).map((item)=><button type="button" className={serviceId===item.id?"selected":""} onClick={()=>{const matches=page.assignments.filter((assignment)=>assignment.services.some((row)=>row.service_id===item.id));setServiceId(item.id);setLocationId(matches[0]?.location_id??"");setDepartmentId("");setResourceId(matches[0]?.resource_id??"");setSlot("");}} key={item.id}><b>{item.name}</b><span>{item.description||`${item.duration_minutes} minute appointment`}</span><small>{item.duration_minutes} min {item.price_paise!=null?`· ₹${(item.price_paise/100).toLocaleString("en-IN")}`:""}</small></button>)}</div></section>
      <section><header><i>2</i><div><b>Choose a chamber</b><span>Select the most convenient location.</span></div></header><div className="concierge-options">{eligibleLocations.map((item)=><button type="button" className={locationId===item.id?"selected":""} onClick={()=>{setLocationId(item.id);setDepartmentId("");setResourceId(eligibleAssignments.find((assignment)=>assignment.location_id===item.id)?.resource_id??"");setLoadingSlots(true);setSlot("");}} key={item.id}><b>{item.name}</b><span>{addressText(item.address)}</span><small>{item.phone||"In-person appointment"}</small></button>)}</div></section>
      {multiDoctor&&<section><header><i>3</i><div><b>Choose a department</b><span>Find the right clinical team before choosing a doctor.</span></div></header><div className="concierge-options department-options">{availableDepartments.map((item)=><button type="button" className={departmentId===item.id?"selected":""} onClick={()=>{setDepartmentId(item.id);const providerLink=(page.provider_departments??[]).find((link)=>link.department_id===item.id);setResourceId(providerLink?.resource_id??"");setSlot("");}} key={item.id}><b>{item.name}</b><span>{item.description||"Clinic department"}</span><small>View available doctors</small></button>)}</div></section>}
      <section><header><i>{multiDoctor?4:3}</i><div><b>Choose a provider</b><span>Select a doctor or take the earliest suitable availability.</span></div></header><div className="provider-cards">{multiDoctor&&availableResources.length>1&&<button type="button" className={resourceId==="any"?"selected":""} onClick={()=>{setResourceId("any");setSlot("");}}><div className="public-provider-photo any-provider">◎</div><div><b>Any available doctor</b><strong>Earliest suitable availability</strong><span>OmniRelay assigns the real doctor attached to your chosen live slot.</span></div></button>}{availableResources.map((item)=><button type="button" className={resourceId===item.id?"selected":""} onClick={()=>{setResourceId(item.id);setSlot("");}} key={item.id}><div className="public-provider-photo">{item.photo_path?<img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/provider-photos/${item.photo_path}`} alt={item.name}/>:<span>{item.name.slice(0,1)}</span>}</div><div><b>{item.name}</b><strong>{item.specialization||item.type}</strong><span>{[item.qualifications,item.experience_years!=null?`${item.experience_years} years experience`:null].filter(Boolean).join(" · ")||"Bookable provider"}</span>{item.languages?.length>0&&<small>Speaks {item.languages.join(", ")}</small>}</div></button>)}</div></section>
      <section><header><i>4</i><div><b>Choose date and time</b><span>Only genuinely available times are shown.</span></div></header><div className="public-date-strip">{dates.map((item)=>{const key=dateKey(item);return <button type="button" className={date===key?"selected":""} onClick={()=>setDate(key)} key={key}><span>{new Intl.DateTimeFormat("en-IN",{weekday:"short"}).format(item)}</span><b>{item.getDate()}</b><small>{new Intl.DateTimeFormat("en-IN",{month:"short"}).format(item)}</small></button>})}</div><div className="public-slots">{loadingSlots?<span>Checking live availability…</span>:slots.length?slots.map((item)=><button type="button" className={slot===item.starts_at?"selected":""} onClick={()=>setSlot(item.starts_at)} key={item.starts_at}>{item.label}</button>):<span>No times available. Please choose another date.</span>}</div></section>
      <section><header><i>5</i><div><b>Patient and booking contact</b><span>One verified contact can safely manage appointments for family members.</span></div></header>
      <div className="concierge-options identity-options">
        <button type="button" className={relationship==="self"?"selected":""} onClick={()=>setRelationship("self")}><b>Myself</b><span>I am the patient</span></button>
        <button type="button" className={relationship!=="self"?"selected":""} onClick={()=>setRelationship("child")}><b>Family member</b><span>Child, parent, spouse or dependant</span></button>
      </div>
      <div className="booking-details">
        <label>Booking contact name<input name="contact_name" required maxLength={120} defaultValue={initialSelection?.bookingContactName} placeholder="Person managing this booking"/></label>
        <label>Booking contact mobile<input name="contact_phone" required maxLength={40} defaultValue={initialSelection?.bookingContactPhone} readOnly={Boolean(initialSelection?.handoffToken)} placeholder="+91…" inputMode="tel"/><small className="field-help">{initialSelection?.handoffToken?"Verified by the active WhatsApp conversation.":"OTP verification will protect repeat access and records."}</small></label>
        {otpAvailable&&<div className="wide otp-verification"><b>WhatsApp number verification</b>{otpChallengeId&&!otpVerificationToken?<><label>6-digit code<input value={otpCode} onChange={(event)=>setOtpCode(event.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000"/></label><button type="button" onClick={verifyOtp} disabled={busy||otpCode.length!==6}>Verify code</button></>:otpVerificationToken?<strong>✓ WhatsApp number verified</strong>:<span>Your code will be sent when you submit these details.</span>}</div>}
        {relationship!=="self"&&<label>Relationship<select value={relationship} onChange={(event)=>setRelationship(event.target.value as PatientRelationship)} name="relationship"><option value="child">Child</option><option value="parent">Parent</option><option value="spouse">Spouse</option><option value="relative">Relative</option><option value="other">Other / dependant</option></select></label>}
        <label>Full name<input name="name" required maxLength={120} defaultValue={initialSelection?.patientName} placeholder="Patient name"/></label>
        <label>Age<input name="age" type="number" min={0} max={120} inputMode="numeric" placeholder="Age in years"/></label>
        <label>Date of birth<input name="date_of_birth" type="date" max={today}/></label>
        {relationship!=="self"&&<label>Patient mobile number<input name="patient_phone" maxLength={40} placeholder="Optional if the patient has no phone" inputMode="tel"/></label>}
        <label>Email address<input name="email" type="email" maxLength={180} placeholder="Optional"/></label>
        <label>Locality<input name="locality" maxLength={120} placeholder="Area or locality"/></label>
        <label>PIN code<input name="pincode" pattern="[0-9]{6}" maxLength={6} inputMode="numeric" placeholder="6-digit PIN"/></label>
        <label className="wide">Reason for visit / health concern<input name="health_concern" maxLength={240} placeholder="For example: follow-up, fever or routine consultation"/></label>
        <label className="wide">Patient summary<textarea name="summary" maxLength={800} placeholder="Symptoms, duration or relevant context for the doctor"/></label>
        <label className="wide">Additional request<input name="notes" maxLength={500} placeholder="Accessibility or scheduling request"/></label>
      </div><div className="booking-consents">
        <label><input name="care_consent" type="checkbox" checked disabled readOnly/><span><b>Booking and care communication · Required</b>Active for appointment confirmations, changes and care reminders related to this booking. You can withdraw future care communication later.</span></label>
        <label><input name="marketing_consent" type="checkbox"/><span><b>Optional health updates</b>I would like to receive relevant clinic news and educational updates. I can opt out later.</span></label>
      </div></section>
      <section><header><i>6</i><div><b>Payment and review</b><span>Choose one of the payment options enabled by the clinic.</span></div></header><div className="payment-choice-grid">
        {allowedPaymentModes.includes("full_online")&&<button type="button" className={activePaymentMode==="full_online"?"selected":""} onClick={()=>setSelectedPaymentMode("full_online")}><b>Pay full online</b><span>Pay ₹{((selectedService?.price_paise??0)/100).toLocaleString("en-IN")} now</span><small>UPI, card or netbanking via Razorpay</small></button>}
        {allowedPaymentModes.includes("deposit_online")&&<button type="button" className={activePaymentMode==="deposit_online"?"selected":""} onClick={()=>setSelectedPaymentMode("deposit_online")}><b>Pay deposit online</b><span>Pay ₹{((selectedService?.deposit_paise??0)/100).toLocaleString("en-IN")} now</span><small>₹{(((selectedService?.price_paise??0)-(selectedService?.deposit_paise??0))/100).toLocaleString("en-IN")} balance at clinic</small></button>}
        {allowedPaymentModes.includes("pay_at_location")&&<button type="button" className={activePaymentMode==="pay_at_location"?"selected":""} onClick={()=>setSelectedPaymentMode("pay_at_location")}><b>Pay at clinic</b><span>₹{((selectedService?.price_paise??0)/100).toLocaleString("en-IN")} due after visit</span><small>No online payment now</small></button>}
      </div></section>
      <div className="public-confirm"><div><span>Selected appointment</span><b>{slot?appointmentLabel(slot,location?.timezone??page.business.timezone):"Choose an available time"}</b><small>{service?.name} · {location?.name}{activePaymentMode==="pay_at_location"?" · Pay at clinic":activePaymentMode==="deposit_online"?` · ₹${((selectedService?.deposit_paise??0)/100).toLocaleString("en-IN")} deposit now`:` · ₹${((selectedService?.price_paise??0)/100).toLocaleString("en-IN")} online`}</small></div><button disabled={!slot||busy}>{busy?"Securing your time…":activePaymentMode==="pay_at_location"?"Confirm — pay at clinic":activePaymentMode==="deposit_online"?`Pay ₹${((selectedService?.deposit_paise??0)/100).toLocaleString("en-IN")} deposit & confirm`:`Pay ₹${((selectedService?.price_paise??0)/100).toLocaleString("en-IN")} & confirm`}</button></div>{message&&<p className="booking-error" role="status">{message}</p>}
    </form>
    <footer><b>{page.business.name}</b><span>{page.business.phone} · {page.business.email}</span><small>Availability is confirmed in real time. Your information is used only to manage this booking.</small></footer>
  </main>;
}
