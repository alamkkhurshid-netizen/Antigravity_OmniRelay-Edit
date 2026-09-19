import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bookingMenu, choiceList, isRepeatableAppointment, isResetCommand, isStopCommand, nextSevenDates, relationshipForChoice, replyButtons } from "./policy.mjs";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");
const textOf = (content: any) => String(content?.data?.button_reply?.id ?? content?.data?.list_reply?.id ?? content?.text ?? content?.data?.button_reply?.title ?? content?.data?.list_reply?.title ?? "").trim();
const choice = (input: string) => Number(input.match(/^\s*(\d+)/)?.[1] ?? 0) - 1;
const consentNotice="OmniRelay will use your WhatsApp identity and the details you provide to create and manage this clinic booking, send appointment updates and care reminders, and maintain the clinic-scoped patient record. Marketing messages require separate consent. Reply 1 to agree or 2 to decline.";
const addressText=(address:any)=>address&&typeof address==="object"?Object.values(address).filter(Boolean).join(", "):String(address??"");
const chamberTimeZone=(context:any)=>String(context?.location?.timezone||context?.resource?.timezone||"Asia/Kolkata");
const fullDate=(date:string,timeZone="Asia/Kolkata")=>new Intl.DateTimeFormat("en-IN",{weekday:"short",day:"numeric",month:"long",year:"numeric",timeZone}).format(new Date(`${date}T12:00:00Z`));
const fullAppointment=(startsAt:string,timeZone="Asia/Kolkata")=>new Intl.DateTimeFormat("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true,timeZone}).format(new Date(startsAt));
const slotTime=(slot:any,timeZone="Asia/Kolkata")=>new Intl.DateTimeFormat("en-IN",{hour:"numeric",minute:"2-digit",hour12:true,timeZone}).format(new Date(slot.starts_at));
const supportedPaymentModes=["pay_at_location","deposit_online","full_online"] as const;
const paymentModeLabel=(mode:string)=>({pay_at_location:"Pay at clinic",deposit_online:"Pay deposit",full_online:"Pay now"}[mode]??mode);
const inr=(paise:number|null|undefined)=>`₹${Math.max(0,Number(paise??0))/100}`.replace(/\.0+$/,"" );

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${serviceKey}`) return json({ error: "Unauthorized" }, 401);
  const { message_id, dry_run, organization_id, input, patient_name } = await req.json();
  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false } });

  if (dry_run) {
    const normalized = String(input ?? "hi").toLowerCase();
    const reply = normalized === "1" ? "Choose a service from the live clinic catalogue." : normalized === "5" ? "Open the clinic's current doctor directory and brochure PDF." : normalized === "6" ? "Clinic timings and locations are shown from the current clinic setup." : normalized === "7" ? "The clinic's recorded front-desk contact is shown." : normalized === "4" && patient_name ? "Repeat your last appointment, then choose a new available date." : bookingMenu("Welcome. I can help with your clinic visit.", String(patient_name ?? ""));
    return json({ ok: true, state: normalized === "1" ? "service" : normalized === "4" && patient_name ? "repeat_confirm" : "welcome", reply });
  }

  const { data: message, error: messageError } = await db.from("messages").select("id,organization_id,conversation_id,organization_address,contact_address,content,direction,service").eq("id", message_id).single();
  if (messageError || !message || message.direction !== "incoming" || message.service !== "whatsapp") return json({ ok: true, ignored: true });
  const { data: settings } = await db.from("whatsapp_booking_settings").select("*").eq("organization_id", message.organization_id).maybeSingle();
  if (!settings?.enabled) return json({ ok: true, ignored: true, reason: "disabled" });

  const send = async (body: string, interactive: any = null) => {
    const queuedAt = new Date().toISOString();
    const { error } = await db.from("messages").insert({
      organization_id: message.organization_id,
      conversation_id: message.conversation_id,
      organization_address: message.organization_address,
      contact_address: message.contact_address,
      service: "whatsapp",
      direction: "outgoing",
      content: interactive
        ? { version: "1", type: "data", kind: "interactive", text: body, data: interactive }
        : { version: "1", type: "text", kind: "text", text: body },
      // OpenBSP's outbound dispatcher watches for status.pending on insert.
      // Keep the source marker, but use the canonical pending timestamp so
      // concierge replies enter the same delivery path as human replies.
      status: { pending: queuedAt, source: "booking_concierge" },
      timestamp: queuedAt,
    });
    if (error) throw error;
  };

  const sendButtons = async (body: string, buttons: Array<{id:string,title:string}>, footer = "") =>
    await send(body, replyButtons(body, buttons, footer));
  const sendList = async (body: string, buttonText: string, rows: Array<{id:string,title:string,description?:string}>, sectionTitle = "Options", footer = "") =>
    await send(body, choiceList(body, buttonText, rows, sectionTitle, footer));
  const sendSlotPage = async (slots: any[], requestedPage = 0) => {
    const pageSize=8;
    const pageCount=Math.max(1,Math.ceil(slots.length/pageSize));
    const page=Math.min(Math.max(0,requestedPage),pageCount-1);
    const start=page*pageSize;
    const visible=slots.slice(start,start+pageSize);
    const timeZone=chamberTimeZone(context);
    const rows=visible.map((slot:any,index:number)=>({id:String(start+index+1),title:slotTime(slot,timeZone)}));
    if(page>0) rows.push({id:"slots_prev",title:"Previous times"});
    if(page<pageCount-1) rows.push({id:"slots_next",title:"More times"});
    const body=`Choose an available time for ${fullDate(context.date,timeZone)}${pageCount>1?` · page ${page+1} of ${pageCount}`:""}:\n${visible.map((slot:any,index:number)=>`${start+index+1}. ${slotTime(slot,timeZone)}`).join("\n")}`;
    await sendList(body,"Choose time",rows,"Available times",pageCount>1?"Use More/Previous to view every available slot":"Only live available times are shown");
    return page;
  };

  const now = new Date();
  const expiry = new Date(now.getTime() + settings.session_timeout_minutes * 60_000).toISOString();
  const contactPhone = digits(message.contact_address);
  let { data: session } = await db.from("whatsapp_booking_sessions").select("*").eq("organization_id", message.organization_id).eq("conversation_id", message.conversation_id).maybeSingle();
  const recoveredExpiredSession = Boolean(session && new Date(session.expires_at) < now);
  if (!session || new Date(session.expires_at) < now) {
    const [{ data: patient }, { data: lastAppointment }] = await Promise.all([
      db.from("patient_profiles").select("id,full_name,phone,primary_contact_phone,identity_status").eq("organization_id", message.organization_id).or(`phone.eq.${contactPhone},primary_contact_phone.eq.${contactPhone}`).order("last_seen_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("appointments").select("id,customer_name,starts_at,status,service:organization_services(id,name,duration_minutes,price_paise),location:business_locations(id,name,address,timezone),resource:booking_resources(id,name,timezone)").eq("organization_id", message.organization_id).or(`customer_phone.eq.${contactPhone},booking_contact_phone.eq.${contactPhone}`).neq("status", "cancelled").order("starts_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const initialContext = { returning_patient: Boolean(patient), patient_profile: patient ? { id: patient.id, full_name: patient.full_name, identity_status: patient.identity_status } : null, last_appointment: isRepeatableAppointment(lastAppointment) ? lastAppointment : null };
    const { data } = await db.from("whatsapp_booking_sessions").upsert({ organization_id: message.organization_id, conversation_id: message.conversation_id, contact_address: message.contact_address, state: "welcome", context: initialContext, last_message_id: message.id, expires_at: expiry }, { onConflict: "organization_id,conversation_id" }).select().single();
    session = data;
  }
  const inbound = textOf(message.content);
  const lower = inbound.toLowerCase();
  let state = session.state;
  let context = session.context ?? {};
  const identityContext = () => ({ returning_patient: Boolean(context.returning_patient), patient_profile: context.patient_profile ?? null, last_appointment: context.last_appointment ?? null });

  if(isStopCommand(inbound)){
    await send("You are opted out of OmniRelay WhatsApp messages for this clinic. Reply START whenever you want to reopen the booking menu. Marketing remains off unless you give separate consent.");
    await db.from("whatsapp_booking_sessions").update({state:"welcome",context:identityContext(),last_message_id:message.id,expires_at:expiry,updated_at:new Date().toISOString()}).eq("id",session.id);
    return json({ok:true,opted_out:true});
  }

  if(lower==="start"){
    const {error:startError}=await db.rpc("restore_whatsapp_care_consent",{
      p_organization_id:message.organization_id,
      p_conversation_id:message.conversation_id,
      p_session_id:session.id,
      p_source_message_id:message.id,
      p_channel_identity:message.contact_address,
    });
    if(startError){
      await send("We could not safely restore WhatsApp care messages. A clinic team member will assist you here.");
      return json({ok:false,error:startError.message});
    }
    await db.from("conversations").update({ai_paused:false,paused_at:null}).eq("id",message.conversation_id).eq("organization_id",message.organization_id);
  }

  if (lower === "accept" || lower === "decline") {
    const { data: waitlistResponse, error: waitlistError } = await db.rpc("respond_waitlist_offer", {
      p_organization_id: message.organization_id,
      p_patient_phone: message.contact_address,
      p_action: lower,
    });
    if (waitlistError) {
      await send("We could not process that waitlist response. A clinic team member will assist you.");
      return json({ ok: false, error: waitlistError.message });
    }
    if (waitlistResponse?.handled) {
      await send(waitlistResponse.reply);
      await db.from("whatsapp_booking_sessions").update({ state: "welcome", context: {}, last_message_id: message.id, expires_at: expiry, updated_at: new Date().toISOString() }).eq("id", session.id);
      return json({ ok: true, waitlist: waitlistResponse });
    }
  }

  const reset = isResetCommand(inbound);
  if (reset) { state = "welcome"; context = { returning_patient: Boolean(context.returning_patient), patient_profile: context.patient_profile ?? null, last_appointment: context.last_appointment ?? null }; }

  const update = async (nextState: string, nextContext = context) => {
    await db.from("whatsapp_booking_sessions").update({ state: nextState, context: nextContext, last_message_id: message.id, expires_at: expiry, updated_at: new Date().toISOString() }).eq("id", session.id);
  };

  const finishBooking = async (selectedPaymentMode: string) => {
    context.payment_mode=selectedPaymentMode;
    if(selectedPaymentMode==="deposit_online"||selectedPaymentMode==="full_online"){
      const baseUrl=String(settings.patient_portal_base_url??"").replace(/\/$/,"");
      const checkout=new URL(`${baseUrl}/book/${context.slug}`);
      checkout.searchParams.set("source","whatsapp");checkout.searchParams.set("service",context.service.id);
      checkout.searchParams.set("location",context.location.id);checkout.searchParams.set("provider",context.resource.id);
      checkout.searchParams.set("date",context.date);checkout.searchParams.set("slot",context.slot.starts_at);
      checkout.searchParams.set("payment",selectedPaymentMode);
      const {data:handoff,error:handoffError}=await db.rpc("create_whatsapp_booking_handoff",{p_organization_id:message.organization_id,p_session_id:session.id,p_conversation_id:message.conversation_id,p_source_message_id:context.consent_source_message_id,p_consent_evidence_id:context.consent_evidence_id,p_context:context});
      if(handoffError||!handoff?.token){await send("We could not create the secure payment handoff. A clinic team member will assist you.");return json({ok:false,error:handoffError?.message});}
      checkout.searchParams.set("handoff",handoff.token);
      await send(`Your time is available. Complete the secure ${paymentModeLabel(selectedPaymentMode).toLowerCase()} here:\n${checkout.toString()}\n\nAvailability is checked again when you confirm. This link contains no medical information.`);
      await update("welcome",identityContext());return json({ok:true,payment_handoff:true,payment_mode:selectedPaymentMode});
    }
    if(selectedPaymentMode!=="pay_at_location"){
      await send("Please choose one of the clinic's available payment options.");
      return json({ok:true,invalid_payment_mode:true});
    }
    if (settings.confirmation_mode === "manual") {
      const {error:requestError}=await db.from("whatsapp_booking_requests").insert({ organization_id:message.organization_id,session_id:session.id,conversation_id:message.conversation_id,patient_name:context.patient_name,patient_phone:context.patient_phone,service_id:context.service.id,location_id:context.location.id,resource_id:context.resource.id,starts_at:context.slot.starts_at,status:"pending_approval",booking_consent_evidence_id:context.consent_evidence_id });
      if(requestError){await send("We could not place this request safely. A clinic team member will assist you here.");return json({ok:false,error:requestError.message});}
      await send("Your pay-at-clinic booking request was sent to the clinic. You will receive confirmation after the doctor or assistant approves it.");
    } else {
      const {data:handoff,error:handoffError}=await db.rpc("create_whatsapp_booking_handoff",{p_organization_id:message.organization_id,p_session_id:session.id,p_conversation_id:message.conversation_id,p_source_message_id:context.consent_source_message_id,p_consent_evidence_id:context.consent_evidence_id,p_context:context});
      if(handoffError||!handoff?.token){await send("We could not secure this booking. A clinic team member will assist you.");return json({ok:false,error:handoffError?.message});}
      const { data: appointment, error } = await db.rpc("create_whatsapp_handoff_appointment", { p_handoff_token:handoff.token,p_slug:context.slug,p_resource_id:context.resource.id,p_location_id:context.location.id,p_service_id:context.service.id,p_customer_name:context.patient_name,p_customer_phone:context.patient_phone,p_customer_email:"",p_starts_at:context.slot.starts_at,p_booking_contact_name:context.booking_contact_name,p_booking_contact_phone:context.booking_contact_phone,p_patient_relationship:context.patient_relationship,p_patient_date_of_birth:null,p_notes:"WhatsApp Booking Concierge",p_intake:{care_communications_consent:true,marketing_consent:false} });
      if (error) { await send(`That slot is no longer available. Reply MENU to choose another time.`); await update("welcome",identityContext()); return json({ok:false,error:error.message}); }
      let {error:completeError}=await db.rpc("complete_whatsapp_booking_handoff",{p_handoff_token:handoff.token,p_booking_reference:appointment.booking_reference,p_manage_token:appointment.manage_token});
      if(completeError){
        const {data:recovered,error:recoveryError}=await db.rpc("create_whatsapp_handoff_appointment",{p_handoff_token:handoff.token,p_slug:context.slug,p_resource_id:context.resource.id,p_location_id:context.location.id,p_service_id:context.service.id,p_customer_name:context.patient_name,p_customer_phone:context.patient_phone,p_customer_email:"",p_starts_at:context.slot.starts_at,p_booking_contact_name:context.booking_contact_name,p_booking_contact_phone:context.booking_contact_phone,p_patient_relationship:context.patient_relationship,p_patient_date_of_birth:null,p_notes:"WhatsApp Booking Concierge",p_intake:{care_communications_consent:true,marketing_consent:false}});
        if(recoveryError||!recovered){await send("The appointment was created, but confirmation needs staff review.");return json({ok:false,error:recoveryError?.message??completeError.message});}
        ({error:completeError}=await db.rpc("complete_whatsapp_booking_handoff",{p_handoff_token:handoff.token,p_booking_reference:recovered.booking_reference,p_manage_token:recovered.manage_token}));
        if(completeError){await send("The appointment is safe, but confirmation needs staff review.");return json({ok:false,error:completeError.message});}
      }
    }
    await update("welcome",identityContext());return json({ok:true,payment_mode:selectedPaymentMode});
  };

  const sendPortalLink = async (scope: "bookings" | "records") => {
    if (!settings.allow_secure_history) {
      await send("Secure patient access is not enabled for this clinic. Reply 9 for human assistance.");
      return;
    }
    const { data: access, error } = await db.rpc("create_patient_portal_session", {
      p_organization_id: message.organization_id,
      p_phone: message.contact_address,
      p_conversation_id: message.conversation_id,
      p_scope: scope,
    });
    if (error) throw error;
    if (!access?.found) {
      await send("We could not match this WhatsApp number to a patient profile. Reply 9 and the clinic team will verify your details.");
      return;
    }
    const baseUrl = String(settings.patient_portal_base_url ?? "").replace(/\/$/, "");
    const label = scope === "bookings" ? "appointments" : "approved visit records";
    await send(`Open your secure ${label}: ${baseUrl}/patient?token=${access.token}\n\nThis private link expires in 15 minutes. Do not forward it.`);
  };

  const sendDirectoryBrochure = async () => {
    const {data:page}=await db.from("booking_pages").select("slug").eq("organization_id",message.organization_id).eq("active",true).maybeSingle();
    const baseUrl=String(settings.patient_portal_base_url??"").replace(/\/$/,"");
    if(!page?.slug||!baseUrl){await send("The doctor directory is being updated. Reply 7 for the front desk or 9 for clinic assistance.");return;}
    await send(`Doctor directory & clinic brochure (PDF):\n${baseUrl}/book/${page.slug}/brochure\n\nIt contains publicly listed doctors, clinic locations and contact details. Reply MENU anytime to return.`);
  };

  const sendClinicInfo = async () => {
    const [{data:profile},{data:locations},{data:rules}]=await Promise.all([
      db.from("onboarding_profiles").select("business_name,primary_phone").eq("organization_id",message.organization_id).maybeSingle(),
      db.from("business_locations").select("id,name,address,phone,google_maps_url").eq("organization_id",message.organization_id).eq("active",true).order("created_at").limit(5),
      db.from("availability_rules").select("location_id,weekday,start_time,end_time,resource:booking_resources(name)").eq("organization_id",message.organization_id).eq("active",true).order("weekday").limit(10),
    ]);
    const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const formatTime=(value:string)=>{const [hour,minute]=String(value).slice(0,5).split(":").map(Number);const suffix=hour>=12?"pm":"am";const twelve=hour%12||12;return `${twelve}:${String(minute).padStart(2,"0")} ${suffix}`};
    const locationLines=(locations??[]).map((location:any,index:number)=>{
      const locationRules=(rules??[]).filter((rule:any)=>rule.location_id===location.id);
      const timings=locationRules.map((rule:any)=>`${rule.resource?.name??"Clinic"}: ${days[Number(rule.weekday)]??""} ${formatTime(rule.start_time)}–${formatTime(rule.end_time)}`);
      return [`${index+1}. ${location.name}`,timings.length?timings.join("\n"):"Timings are being updated.",addressText(location.address)||"Address is being updated.",location.google_maps_url?`Google Maps: ${location.google_maps_url}`:"",location.phone?`Front desk: ${location.phone}`:""].filter(Boolean).join("\n");
    });
    await send(`${profile?.business_name??"Clinic"} timings & location\n\n${locationLines.length?locationLines.join("\n\n"):"Location details have not yet been recorded."}\n\nLive appointment availability is confirmed when you choose an appointment.`);
  };

  const sendFrontDesk = async () => {
    const [{data:profile},{data:location}]=await Promise.all([
      db.from("onboarding_profiles").select("business_name,primary_phone").eq("organization_id",message.organization_id).maybeSingle(),
      db.from("business_locations").select("phone").eq("organization_id",message.organization_id).eq("active",true).not("phone","is",null).order("created_at").limit(1).maybeSingle(),
    ]);
    const phone=profile?.primary_phone??location?.phone;
    await send(phone?`${profile?.business_name??"Clinic"} front desk: ${phone}\n\nPlease call during clinic hours. Reply MENU to return to patient services.`:"The clinic front-desk number has not been recorded yet. Reply 9 and the clinic team will assist you here.");
  };

  if (state === "welcome") {
    if (!reset && inbound === "1") state = "service";
    else if (!reset && inbound === "2") {
      const {data:appointments}=await db.from("appointments").select("id,starts_at,status,service_id,location_id,resource_id,service:organization_services(id,name,duration_minutes),location:business_locations(id,name,timezone),resource:booking_resources(id,name,timezone)")
        .eq("organization_id",message.organization_id).or(`customer_phone.eq.${contactPhone},booking_contact_phone.eq.${contactPhone}`)
        .gt("starts_at",new Date().toISOString()).in("status",["pending","confirmed","rescheduling_required"]).order("starts_at").limit(10);
      if(!appointments?.length){await send("No upcoming appointment was found for this WhatsApp number. Reply MENU to book or 9 for clinic assistance.");await update("welcome",identityContext());return json({ok:true});}
      context={...identityContext(),manageable_appointments:appointments};
      const rows=appointments.map((a:any,i:number)=>({id:String(i+1),title:fullAppointment(a.starts_at,chamberTimeZone({location:a.location,resource:a.resource})).slice(0,24),description:`${a.service?.name??"Appointment"} · ${a.location?.name??"Clinic"}`}));
      await sendList(`Choose an appointment to manage:\n${appointments.map((a:any,i:number)=>`${i+1}. ${a.service?.name??"Appointment"} · ${fullAppointment(a.starts_at,chamberTimeZone({location:a.location,resource:a.resource}))}`).join("\n")}`,"Choose booking",rows,"Upcoming appointments");
      await update("manage_booking_select",context);return json({ok:true});
    }
    else if (!reset && inbound === "3") { await sendPortalLink("records"); await update("welcome", identityContext()); return json({ ok: true }); }
    else if (!reset && inbound === "4" && context.returning_patient) {
      if (!isRepeatableAppointment(context.last_appointment)) { await send("We could not find a previous appointment that can be repeated. Reply 1 to choose a new appointment or 9 for assistance."); return json({ ok: true }); }
      const previous=context.last_appointment;
      context.service=previous.service;context.location=previous.location;context.resource=previous.resource;
      await sendButtons(`Repeat your last appointment?\n${previous.service.name}\n${previous.location.name}\n${previous.resource.name}\n\n1. Continue and choose a new date\n2. Start a different booking`,[{id:"1",title:"Repeat appointment"},{id:"2",title:"Different booking"}]);
      await update("repeat_confirm",context);return json({ok:true});
    }
    else if (!reset && inbound === "5") { await sendDirectoryBrochure(); await update("welcome",identityContext()); return json({ok:true,directory_brochure:true}); }
    else if (!reset && inbound === "6") { await sendClinicInfo(); await update("welcome",identityContext()); return json({ok:true,clinic_info:true}); }
    else if (!reset && inbound === "7") { await sendFrontDesk(); await update("welcome",identityContext()); return json({ok:true,front_desk:true}); }
    else if (!reset && inbound === "9") { await db.from("conversations").update({ ai_paused: true, paused_at: new Date().toISOString() }).eq("id", message.conversation_id); await send("A clinic team member will assist you here. The automated concierge is now paused."); await update("human", {}); return json({ ok: true }); }
    else {
      const recoveryNotice=recoveredExpiredSession?"Your previous booking session expired, so I started a fresh secure session.\n\n":"";
      const startNotice=lower==="start"?"Clinic booking and care messages are active again. Marketing remains off unless you separately opt in.\n\n":"";
      const menuBody=`${recoveryNotice}${startNotice}${bookingMenu(settings.welcome_message,context.patient_profile?.full_name)}`;
      const menuRows=[{id:"1",title:"Choose appointment",description:"Recommended"},{id:"2",title:"My bookings"},{id:"3",title:"Last visit / prescription"},...(context.returning_patient?[{id:"4",title:"Repeat appointment"}]:[]),{id:"5",title:"Doctor directory & PDF",description:"Doctors and clinic brochure"},{id:"6",title:"Timings & location",description:"Clinic details"},{id:"7",title:"Speak to front desk",description:"Clinic phone number"},{id:"9",title:"Human assistance"}];
      await sendList(menuBody,"Open menu",menuRows,"Patient services","Type MENU anytime to restart"); await update("welcome", context); return json({ ok: true });
    }
  }

  if(state==="manage_booking_select"){
    const selected=context.manageable_appointments?.[choice(inbound)];
    if(!selected){await send("Please choose a valid appointment number.");return json({ok:true});}
    context.managed_appointment=selected;delete context.manageable_appointments;
    await sendButtons(`${selected.service?.name??"Appointment"}\n${fullAppointment(selected.starts_at,chamberTimeZone({location:selected.location,resource:selected.resource}))}\n${selected.location?.name??"Clinic"}\n\nWhat would you like to do?`,[{id:"1",title:"Reschedule"},{id:"2",title:"Cancel booking"},{id:"3",title:"Back to menu"}]);
    await update("manage_booking_action",context);return json({ok:true});
  }

  if(state==="manage_booking_action"){
    if(inbound==="3"){await update("welcome",identityContext());await send("Reply MENU to open patient services.");return json({ok:true});}
    if(inbound==="2"){await sendButtons("Cancel this appointment? This action cannot be undone.",[{id:"1",title:"Confirm cancel"},{id:"2",title:"Keep booking"}]);await update("manage_cancel_confirm",context);return json({ok:true});}
    if(inbound==="1"){
      context.dates=nextSevenDates();
      const rows=context.dates.map((x:string,i:number)=>({id:String(i+1),title:fullDate(x,chamberTimeZone({location:context.managed_appointment.location,resource:context.managed_appointment.resource}))}));
      await sendList(`Choose a new date:\n${rows.map((x:any)=>`${x.id}. ${x.title}`).join("\n")}`,"Choose date",rows,"Available dates");await update("manage_reschedule_date",context);return json({ok:true});
    }
    await send("Reply 1 to reschedule, 2 to cancel, or 3 for the menu.");return json({ok:true});
  }

  if(state==="manage_cancel_confirm"){
    if(inbound==="2"){await send("Your appointment remains confirmed. Reply MENU for patient services.");await update("welcome",identityContext());return json({ok:true});}
    if(inbound!=="1"){await send("Reply 1 to confirm cancellation or 2 to keep the booking.");return json({ok:true});}
    const {error}=await db.rpc("manage_whatsapp_appointment",{p_organization_id:message.organization_id,p_conversation_id:message.conversation_id,p_contact_address:message.contact_address,p_appointment_id:context.managed_appointment.id,p_action:"cancel",p_starts_at:null});
    if(error){await send("We could not cancel that appointment safely. Reply 9 for clinic assistance.");return json({ok:false,error:error.message});}
    await send("Your appointment has been cancelled. Reply MENU whenever you need another booking.");await update("welcome",identityContext());return json({ok:true});
  }

  if(state==="manage_reschedule_date"){
    const date=context.dates?.[choice(inbound)];if(!date){await send("Please choose a valid date number.");return json({ok:true});}
    const a=context.managed_appointment;
    const {data:page}=await db.from("booking_pages").select("slug").eq("organization_id",message.organization_id).eq("active",true).maybeSingle();
    const {data:slots}=await db.rpc("get_public_booking_slots",{p_slug:page?.slug,p_service_id:a.service_id,p_location_id:a.location_id,p_resource_id:a.resource_id,p_date:date});
    context.date=date;context.slots=slots??[];context.service=a.service;context.location=a.location;context.resource=a.resource;
    if(!context.slots.length){await send("No free slots remain on that date. Reply MENU and choose My bookings again.");await update("welcome",identityContext());return json({ok:true});}
    context.slot_page=await sendSlotPage(context.slots,0);await update("manage_reschedule_slot",context);return json({ok:true});
  }

  if(state==="manage_reschedule_slot"){
    if(inbound==="slots_next"||inbound==="slots_prev"){context.slot_page=await sendSlotPage(context.slots,(context.slot_page??0)+(inbound==="slots_next"?1:-1));await update("manage_reschedule_slot",context);return json({ok:true});}
    const slot=context.slots?.[choice(inbound)];if(!slot){await send("Please choose a valid available time.");return json({ok:true});}
    const {error}=await db.rpc("manage_whatsapp_appointment",{p_organization_id:message.organization_id,p_conversation_id:message.conversation_id,p_contact_address:message.contact_address,p_appointment_id:context.managed_appointment.id,p_action:"reschedule",p_starts_at:slot.starts_at});
    if(error){await send(error.message.includes("just booked")?"That time was just booked. Reply MENU and choose another slot.":"We could not reschedule safely. Reply 9 for clinic assistance.");return json({ok:false,error:error.message});}
    await send(`Your appointment is rescheduled to ${fullAppointment(slot.starts_at,chamberTimeZone({location:context.managed_appointment.location,resource:context.managed_appointment.resource}))}. Reply MENU for patient services.`);await update("welcome",identityContext());return json({ok:true});
  }

  if(state==="repeat_confirm"){
    if(inbound==="2"){context={returning_patient:context.returning_patient,patient_profile:context.patient_profile,last_appointment:context.last_appointment};state="service";}
    else if(inbound==="1"){
      const {data:assignment}=await db.from("provider_location_assignments").select("id").eq("organization_id",message.organization_id).eq("location_id",context.location.id).eq("resource_id",context.resource.id).eq("active",true).limit(1).maybeSingle();
      const {data:service}=await db.from("organization_services").select("id").eq("id",context.service.id).eq("organization_id",message.organization_id).eq("active",true).eq("booking_enabled",true).maybeSingle();
      if(!assignment||!service){await send("That previous clinic setup is no longer bookable. Reply 1 to choose a new appointment.");await update("welcome",context);return json({ok:true});}
      const {data:page}=await db.from("booking_pages").select("slug").eq("organization_id",message.organization_id).eq("active",true).maybeSingle();context.slug=page?.slug;
      context.dates=nextSevenDates();{const rows=context.dates.map((x:string,i:number)=>({id:String(i+1),title:fullDate(x,chamberTimeZone(context))}));await sendList(`Choose a new date for ${context.service.name}:\n${rows.map((x:any)=>`${x.id}. ${x.title}`).join("\n")}`,"Choose date",rows,"Available dates");}await update("date",context);return json({ok:true,returning_patient:true});
    } else {await send("Reply 1 to repeat the appointment or 2 to choose something different.");return json({ok:true});}
  }

  if (state === "service") {
    const { data: services } = await db.from("organization_services").select("id,name,duration_minutes,price_paise").eq("organization_id", message.organization_id).eq("active", true).eq("booking_enabled", true).order("name");
    if (!context.services) { context.services = services ?? []; const body=`Choose a service:\n${context.services.map((x:any,i:number)=>`${i+1}. ${x.name} · ${x.duration_minutes} min`).join("\n")}`; await sendList(body,"Choose service",context.services.map((x:any,i:number)=>({id:String(i+1),title:x.name,description:`${x.duration_minutes} min`})),"Services"); await update("service", context); return json({ ok: true }); }
    const selected = context.services[choice(inbound)];
    if (!selected) { await send("Please reply with a valid service number."); return json({ ok: true }); }
    context.service = selected; delete context.services;
    const { data: assignments } = await db.from("provider_location_assignments").select("location_id,resource_id,location:business_locations(id,name,address,timezone),resource:booking_resources(id,name,timezone)").eq("organization_id", message.organization_id).eq("active", true);
    const unique = new Map<string,any>(); for (const a of assignments ?? []) if (!unique.has(a.location_id)) unique.set(a.location_id, a.location);
    context.locations = [...unique.values()]; {const body=`Choose a chamber/location:\n${context.locations.map((x:any,i:number)=>`${i+1}. ${x.name}${addressText(x.address) ? ` — ${addressText(x.address)}` : ""}`).join("\n")}`;await sendList(body,"Choose chamber",context.locations.map((x:any,i:number)=>({id:String(i+1),title:x.name,description:addressText(x.address)})),"Locations");} await update("location", context); return json({ ok: true });
  }

  if (state === "location") {
    const selected = context.locations?.[choice(inbound)]; if (!selected) { await send("Please reply with a valid chamber number."); return json({ ok: true }); }
    context.location = selected; delete context.locations;
    const [{data:assignments},{data:profile}]=await Promise.all([
      db.from("provider_location_assignments").select("resource:booking_resources(id,name,timezone)").eq("organization_id",message.organization_id).eq("location_id",selected.id).eq("active",true),
      db.from("onboarding_profiles").select("clinic_mode").eq("organization_id",message.organization_id).maybeSingle(),
    ]);
    context.resources=(assignments??[]).map((x:any)=>x.resource).filter(Boolean);
    if(profile?.clinic_mode==="multi_doctor_clinic"){
      const resourceIds=context.resources.map((item:any)=>item.id);
      const {data:links}=resourceIds.length?await db.from("provider_departments").select("department_id,resource_id,department:clinic_departments(id,name,description,sort_order)").eq("organization_id",message.organization_id).in("resource_id",resourceIds):{data:[]};
      const departments=[...new Map<string,any>((links??[]).map((link:any)=>[link.department_id,link.department])).values()].filter(Boolean).sort((a:any,b:any)=>(a.sort_order??0)-(b.sort_order??0)||a.name.localeCompare(b.name));
      if(departments.length){context.departments=departments;context.provider_departments=links??[];const body=`Choose a department:\n${departments.map((item:any,index:number)=>`${index+1}. ${item.name}`).join("\n")}`;await sendList(body,"Choose department",departments.map((item:any,index:number)=>({id:String(index+1),title:item.name,description:item.description??"Clinic department"})),"Departments");await update("department",context);return json({ok:true,multi_doctor:true});}
    }
    {const body=`Choose a doctor/provider:\n${context.resources.map((x:any,i:number)=>`${i+1}. ${x.name}`).join("\n")}`;await sendList(body,"Choose doctor",context.resources.map((x:any,i:number)=>({id:String(i+1),title:x.name})),"Providers");} await update("resource", context); return json({ ok: true });
  }

  if(state==="department"){
    const department=context.departments?.[choice(inbound)];if(!department){await send("Please choose a valid department number.");return json({ok:true});}
    const allowedIds=new Set((context.provider_departments??[]).filter((link:any)=>link.department_id===department.id).map((link:any)=>link.resource_id));
    context.department=department;context.resources=(context.resources??[]).filter((item:any)=>allowedIds.has(item.id));delete context.departments;delete context.provider_departments;
    if(!context.resources.length){await send("No doctor is currently bookable in that department. Reply MENU to choose again or 9 for clinic assistance.");await update("welcome",identityContext());return json({ok:true});}
    const rows=[...(context.resources.length>1?[{id:"any_provider",title:"Any available doctor",description:"Earliest suitable availability"}]:[]),...context.resources.map((item:any,index:number)=>({id:String(index+1),title:item.name}))];
    const body=`Choose a doctor in ${department.name}:\n${context.resources.length>1?"Any available doctor — earliest suitable availability\n":""}${context.resources.map((item:any,index:number)=>`${index+1}. ${item.name}`).join("\n")}`;
    await sendList(body,"Choose doctor",rows,"Providers");await update("resource",context);return json({ok:true});
  }

  if (state === "resource") {
    const anyProvider=inbound==="any_provider"&&context.resources?.length>1;
    const selected=anyProvider?null:context.resources?.[choice(inbound)];if(!anyProvider&&!selected){await send("Please choose a valid doctor.");return json({ok:true});}
    context.resource_mode=anyProvider?"any":"specific";if(selected)context.resource=selected;if(!anyProvider)delete context.resources;
    const { data: page } = await db.from("booking_pages").select("slug").eq("organization_id", message.organization_id).eq("active", true).maybeSingle(); context.slug = page?.slug;
    context.dates = nextSevenDates();
    {const rows=context.dates.map((x:string,i:number)=>({id:String(i+1),title:fullDate(x,chamberTimeZone(context))}));await sendList(`Choose a date:\n${rows.map((x:any)=>`${x.id}. ${x.title}`).join("\n")}`,"Choose date",rows,"Available dates");} await update("date", context); return json({ ok: true });
  }

  if (state === "date") {
    const date = context.dates?.[choice(inbound)]; if (!date) { await send("Please reply with a valid date number."); return json({ ok: true }); }
    let slots:any[]=[];
    if(context.resource_mode==="any"){
      const results=await Promise.all((context.resources??[]).map(async(resource:any)=>{const {data}=await db.rpc("get_public_booking_slots",{p_slug:context.slug,p_service_id:context.service.id,p_location_id:context.location.id,p_resource_id:resource.id,p_date:date});return(data??[]).map((slot:any)=>({...slot,resource_id:resource.id}));}));
      slots=results.flat().sort((a:any,b:any)=>a.starts_at.localeCompare(b.starts_at)).filter((slot:any,index:number,all:any[])=>index===all.findIndex((candidate:any)=>candidate.starts_at===slot.starts_at));
    }else{
      const result=await db.rpc("get_public_booking_slots",{p_slug:context.slug,p_service_id:context.service.id,p_location_id:context.location.id,p_resource_id:context.resource.id,p_date:date});slots=result.data??[];
    }
    context.date=date;context.slots=slots;if(!context.slots.length){await send("No free slots remain on that date. Reply MENU to start again and choose another date.");await update("welcome",identityContext());return json({ok:true});}
    context.slot_page=await sendSlotPage(context.slots,0); await update("slot",context); return json({ ok: true });
  }

  if (state === "slot") {
    if(inbound==="slots_next"||inbound==="slots_prev"){
      const delta=inbound==="slots_next"?1:-1;
      context.slot_page=await sendSlotPage(context.slots,Number(context.slot_page??0)+delta);
      await update("slot",context);return json({ok:true,slot_page:context.slot_page});
    }
    const slot = context.slots?.[choice(inbound)]; if (!slot) { await send("Please reply with a valid time number."); return json({ ok: true }); }
    context.slot=slot;if(context.resource_mode==="any"){context.resource=context.resources?.find((item:any)=>item.id===slot.resource_id);if(!context.resource){await send("That doctor is no longer available. Reply MENU and choose another time.");await update("welcome",identityContext());return json({ok:true});}delete context.resources;} delete context.slots;delete context.slot_page; {const body="Who is this appointment for?\n1. Myself\n2. Child\n3. Parent\n4. Spouse\n5. Other family member / dependant";await sendList(body,"Choose patient",[{id:"1",title:"Myself"},{id:"2",title:"Child"},{id:"3",title:"Parent"},{id:"4",title:"Spouse"},{id:"5",title:"Other dependant"}],"Patient");} await update("relationship",context); return json({ ok: true });
  }
  if (state === "relationship") { const selected=relationshipForChoice(inbound);if(!selected){await send("Please reply with a number from 1 to 5.");return json({ok:true});}context.patient_relationship=selected;context.booking_contact_phone=digits(message.contact_address);await send(selected==="self"?"What is your full name?":"What is the patient’s full name?");await update("name",context);return json({ok:true}); }
  if (state === "name") { if (inbound.length < 2) { await send("Please enter the patient’s full name."); return json({ok:true}); } context.patient_name=inbound;if(context.patient_relationship==="self"){context.booking_contact_name=inbound;context.patient_phone=context.booking_contact_phone;await sendButtons(`Confirm this booking?\n${context.patient_name}\n${context.service.name}\n${context.location.name}\n${context.resource.name}\n${fullAppointment(context.slot.starts_at,chamberTimeZone(context))}\n\nReply 1 to confirm or 2 to cancel.`,[{id:"1",title:"Confirm booking"},{id:"2",title:"Cancel"}]);await update("confirm",context);return json({ok:true});}await send("What is your name as the parent, guardian or booking contact?");await update("guardian_name",context);return json({ok:true}); }
  if (state === "guardian_name") {if(inbound.length<2){await send("Please enter the booking contact’s full name.");return json({ok:true});}context.booking_contact_name=inbound;context.patient_phone=context.booking_contact_phone;await sendButtons(`Confirm this booking?\nPatient: ${context.patient_name}\nBooked by: ${context.booking_contact_name} (${context.patient_relationship})\n${context.service.name}\n${context.location.name}\n${context.resource.name}\n${fullAppointment(context.slot.starts_at,chamberTimeZone(context))}\n\nReply 1 to confirm or 2 to cancel.`,[{id:"1",title:"Confirm booking"},{id:"2",title:"Cancel"}]);await update("confirm",context);return json({ok:true});}
  if (state === "confirm") {
    if (inbound === "2") { await send("Booking cancelled. Reply MENU whenever you want to start again."); await update("welcome",identityContext()); return json({ok:true}); }
    if (inbound !== "1") { await send("Reply 1 to confirm or 2 to cancel."); return json({ok:true}); }
    await sendButtons(`${consentNotice}\n\n1. Agree and continue\n2. Decline`,[{id:"1",title:"Agree and continue"},{id:"2",title:"Decline"}],"Your choice is recorded with the clinic");
    await update("consent",context);return json({ok:true});
  }
  if (state === "consent") {
    if(inbound==="2"){
      await db.rpc("record_whatsapp_booking_consent",{p_organization_id:message.organization_id,p_conversation_id:message.conversation_id,p_session_id:session.id,p_source_message_id:message.id,p_channel_identity:message.contact_address,p_notice_version:"whatsapp-booking-v1",p_notice_text:consentNotice,p_action:"declined"});
      await send("Consent declined. No booking was created. Reply MENU whenever you want to start again.");await update("welcome",identityContext());return json({ok:true});
    }
    if(inbound!=="1"){await send("Reply 1 to agree and continue or 2 to decline.");return json({ok:true});}
    const {data:consentId,error:consentError}=await db.rpc("record_whatsapp_booking_consent",{p_organization_id:message.organization_id,p_conversation_id:message.conversation_id,p_session_id:session.id,p_source_message_id:message.id,p_channel_identity:message.contact_address,p_notice_version:"whatsapp-booking-v1",p_notice_text:consentNotice,p_action:"accepted"});
    if(consentError||!consentId){await send("We could not record consent safely. A clinic team member will assist you.");return json({ok:false,error:consentError?.message});}
    context.consent_evidence_id=consentId;
    context.consent_source_message_id=message.id;
    const {error:optInError}=await db.from("communication_opt_outs").delete().eq("organization_id",message.organization_id).eq("channel","whatsapp").eq("address",contactPhone).in("scope",["all","care"]);
    if(optInError){await send("Your consent was recorded, but communication preferences need clinic review before booking can continue.");return json({ok:false,error:optInError.message});}
    const { data: paymentPolicy } = await db.from("provider_location_services")
      .select("allowed_payment_modes,price_paise,deposit_paise")
      .eq("organization_id",message.organization_id)
      .eq("service_id",context.service.id)
      .eq("active",true)
      .in("assignment_id",(await db.from("provider_location_assignments").select("id").eq("organization_id",message.organization_id).eq("location_id",context.location.id).eq("resource_id",context.resource.id).eq("active",true)).data?.map((row:any)=>row.id)??[])
      .limit(1).maybeSingle();
    const paymentModes=[...new Set((paymentPolicy?.allowed_payment_modes??["pay_at_location"]).filter((mode:string)=>supportedPaymentModes.includes(mode as any)))];
    context.payment_modes=paymentModes.length?paymentModes:["pay_at_location"];
    const fullFee=Number(paymentPolicy?.price_paise??context.service?.price_paise??0);
    const deposit=Number(paymentPolicy?.deposit_paise??0);
    const providerName=String(context.resource?.name??"Your doctor");
    const paymentDetail=(mode:string)=>mode==="pay_at_location"?`${paymentModeLabel(mode)} — ${inr(fullFee)} after visit`:mode==="deposit_online"?`${paymentModeLabel(mode)} — ${inr(deposit)} online`:`${paymentModeLabel(mode)} — ${inr(fullFee)} online`;
    await sendButtons(`${providerName}'s consultation fee: ${inr(fullFee)}.\n\nChoose payment method:\n${context.payment_modes.map((mode:string,index:number)=>`${index+1}. ${paymentDetail(mode)}`).join("\n")}`,context.payment_modes.map((mode:string,index:number)=>({id:String(index+1),title:paymentModeLabel(mode)})),"Online payments open a secure Razorpay page");
    await update("payment",context);return json({ok:true,payment_selection:true});
  }
  if(state==="payment"){
    const selected=context.payment_modes?.[choice(inbound)];
    if(!selected){await send("Please reply with a valid payment option number.");return json({ok:true});}
    return await finishBooking(selected);
  }
  return json({ ok: true, ignored: true, state });
});
