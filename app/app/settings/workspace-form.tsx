"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChamberScheduleEditor } from "./chamber-schedule-editor";

const categories = [
  "Healthcare", "Restaurants & hospitality", "Coaching & education",
  "Beauty & wellness", "Professional services", "Real estate",
  "Automotive services", "Retail & e-commerce", "Home services", "Other",
];

type Address = { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string };
type Location = { id?: string; name: string; location_type: string; phone?: string | null; google_maps_url?: string | null; timezone: string; address: Address; active?: boolean };
type Service = { id?: string; name: string; service_type: string; duration_minutes: number; price_paise?: number | null; buffer_minutes?: number; description?: string | null; booking_enabled?: boolean; active?: boolean };
type Resource = { id:string; name:string; resource_type:string; timezone:string; isNew?:boolean };
type ProviderProfile = { resource_id:string; photo_path:string|null; specialization:string|null; qualifications:string|null; registration_number:string|null; experience_years:number|null; languages:string[]; biography:string|null; contact_phone:string|null; contact_email:string|null };
type Department={id:string;name:string;code:string|null;description:string|null;active:boolean;sort_order:number};

const emptyProvider=(resourceId:string):ProviderProfile=>({resource_id:resourceId,photo_path:null,specialization:"",qualifications:"",registration_number:"",experience_years:null,languages:[],biography:"",contact_phone:"",contact_email:""});
const validWhatsapp=(value:string|null)=>!value||/^\+[1-9]\d{7,14}$/.test(value.replace(/[\s()-]/g,""));
const phoneDigits=(value:string)=>value.replace(/\D/g,"");
const validPhone=(value:string)=>{
  if(!value.trim()) return true;
  const digits=phoneDigits(value);
  return (digits.length>=8&&digits.length<=15) || (digits.length===11&&digits.startsWith("0"));
};
const validPostalCode=(value:string)=>!value.trim()||/^\d{6}$/.test(value.trim());
const validWebsite=(value:string)=>!value.trim()||/^https?:\/\/[^\s]+\.[^\s]+$/i.test(value.trim());
const validHttps=(value:string)=>!value.trim()||/^https:\/\/[^\s]+$/i.test(value.trim());
const Required = () => <span className="required-mark" aria-label="required">*</span>;

export function WorkspaceForm({ organization, profile, locations: initialLocations, services: initialServices, resources: initialResources, providerProfiles, assignments, assignmentServices, chamberRules, paymentGateway, departments:initialDepartments,providerDepartments }: {
  organization: { id: string; name: string; extra: Record<string, unknown> | null };
  profile: Record<string, unknown> | null;
  locations: Location[];
  services: Service[];
  resources: Resource[];
  providerProfiles: ProviderProfile[];
  assignments: Array<{id:string;resource_id:string;location_id:string;active:boolean;effective_from:string;effective_to:string|null;booking_window_days:number}>;
  assignmentServices: Array<{assignment_id:string;service_id:string;active:boolean;duration_minutes:number|null;buffer_minutes:number|null;price_paise:number|null;payment_mode:"pay_at_location"|"full_online"|"deposit_online";allowed_payment_modes?:Array<"pay_at_location"|"full_online"|"deposit_online">;deposit_paise:number|null}>;
  chamberRules: Array<{id?:string;resource_id:string;location_id:string|null;weekday:number;start_time:string;end_time:string;slot_interval_minutes:number}>;
  paymentGateway: {provider:string;status:string;account_label:string|null;last_verified_at:string|null}|null;
  departments:Department[];
  providerDepartments:Array<{department_id:string;resource_id:string;primary_department:boolean}>;
  calendarConnections?: Array<{resource_id: string|null; expires_at: string}>;
}) {
  const extra = organization.extra ?? {};
  const [name, setName] = useState(organization.name);
  const [category, setCategory] = useState(String(profile?.business_category ?? extra.business_category ?? "Other"));
  const [description, setDescription] = useState(String(profile?.description ?? ""));
  const [clinicMode,setClinicMode]=useState(String(profile?.clinic_mode??"solo_practitioner"));
  const [departments,setDepartments]=useState<Department[]>(initialDepartments);
  const [providerDepartmentMap,setProviderDepartmentMap]=useState<Record<string,string[]>>(()=>providerDepartments.reduce<Record<string,string[]>>((map,item)=>{(map[item.resource_id]??=[]).push(item.department_id);return map;},{}));
  const [phone, setPhone] = useState(String(profile?.primary_phone ?? ""));
  const [email, setEmail] = useState(String(profile?.email ?? ""));
  const [website, setWebsite] = useState(String(profile?.website ?? ""));
  const [customBrochureUrl,setCustomBrochureUrl]=useState(String(profile?.custom_brochure_url??""));
  const [customBrochurePath,setCustomBrochurePath]=useState(String(profile?.custom_brochure_storage_path??""));
  const [locations, setLocations] = useState<Location[]>(initialLocations);
  const [services, setServices] = useState<Service[]>(initialServices);
  const [resources, setResources] = useState<Resource[]>(initialResources);
  const [providerId, setProviderId] = useState(initialResources[0]?.id ?? "");
  const [providers, setProviders] = useState<ProviderProfile[]>(providerProfiles);
  const provider = providers.find((item)=>item.resource_id===providerId) ?? emptyProvider(providerId);
  const [photoPreview, setPhotoPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const businessPhoneError=!phone.trim()||!validPhone(phone);
  const websiteError=website.trim()&&!validWebsite(website);
  const brochureUrlError=!validHttps(customBrochureUrl);

  const rosterDispatchInitial = (extra.roster_dispatch || {}) as {
    enabled?: boolean;
    dispatch_time?: string;
    clinic_email?: string;
    send_to_clinic?: boolean;
    send_to_doctors?: boolean;
  };
  const [dispatchEnabled, setDispatchEnabled] = useState(Boolean(rosterDispatchInitial.enabled));
  const [dispatchTime, setDispatchTime] = useState(rosterDispatchInitial.dispatch_time || "20:00");
  const [dispatchClinicEmail, setDispatchClinicEmail] = useState(rosterDispatchInitial.clinic_email || "");
  const [sendToClinic, setSendToClinic] = useState(rosterDispatchInitial.send_to_clinic !== false);
  const [sendToDoctors, setSendToDoctors] = useState(rosterDispatchInitial.send_to_doctors !== false);
  const [dispatchNotice, setDispatchNotice] = useState("");
  const [dispatchingTest, setDispatchingTest] = useState(false);

  async function testDispatch() {
    setDispatchingTest(true);
    setDispatchNotice("");
    try {
      const res = await fetch("/api/clinic-operations/roster/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to dispatch test email");
      const simulatedNotice = !data.liveEmailConfigured ? " (Preview mode: add RESEND_API_KEY for live delivery)" : "";
      setDispatchNotice(`Test dispatch processed: ${data.results?.length || 0} recipient(s) checked.${simulatedNotice}`);
    } catch (err: unknown) {
      setDispatchNotice(err instanceof Error ? err.message : "Test dispatch failed.");
    } finally {
      setDispatchingTest(false);
    }
  }

  const changeLocation = (index: number, patch: Partial<Location>) =>
    setLocations((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  const changeAddress = (index: number, patch: Partial<Address>) =>
    setLocations((items) => items.map((item, i) => i === index ? { ...item, address: { ...item.address, ...patch } } : item));
  const changeService = (index: number, patch: Partial<Service>) =>
    setServices((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  function chooseProvider(id:string) {
    setProviderId(id);
    setPhotoPreview("");
  }
  function setProvider(next:ProviderProfile){
    setProviders((current)=>current.some((item)=>item.resource_id===next.resource_id)?current.map((item)=>item.resource_id===next.resource_id?next:item):[...current,next]);
  }
  function renameProvider(nextName:string){
    setResources((current)=>current.map((item)=>item.id===providerId?{...item,name:nextName}:item));
  }
  function addDoctor(){
    const id=crypto.randomUUID();
    setResources((current)=>[...current,{id,name:"",resource_type:"doctor",timezone:"Asia/Kolkata",isNew:true}]);
    setProviderId(id);
    setPhotoPreview("");
  }
  async function uploadProviderPhoto(file:File) {
    if(!providerId)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>5*1024*1024){setMessage("Use a JPG, PNG or WebP image smaller than 5 MB.");return}
    setBusy(true);setMessage("");
    const supabase=createClient();
    const extension=file.name.split(".").pop()?.toLowerCase()||"jpg";
    const path=`${organization.id}/providers/${providerId}-${Date.now()}.${extension}`;
    const {error}=await supabase.storage.from("provider-photos").upload(path,file,{upsert:false,contentType:file.type});
    if(error){setMessage(error.message);setBusy(false);return}
    setProvider({...provider,photo_path:path});
    setPhotoPreview(URL.createObjectURL(file));
    setBusy(false);
  }
  async function uploadClinicBrochure(file:File) {
    if(file.type!=="application/pdf"||file.size<=0||file.size>10*1024*1024){setMessage("Upload a PDF brochure up to 10 MB.");return}
    setBusy(true);setMessage("");
    const path=`${organization.id}/brochures/${crypto.randomUUID()}.pdf`;
    const {error}=await createClient().storage.from("clinic-brochures").upload(path,file,{upsert:false,contentType:"application/pdf"});
    if(error){setMessage(error.message);setBusy(false);return}
    if(customBrochurePath)await createClient().storage.from("clinic-brochures").remove([customBrochurePath]);
    setCustomBrochurePath(path);setCustomBrochureUrl("");setMessage("Custom brochure uploaded. Select Save business setup to publish it.");setBusy(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    if(!name.trim()) { setMessage("Enter your business name before saving."); return; }
    if(businessPhoneError) { setMessage("Enter a valid business phone number (8–15 digits, with country code if available)."); return; }
    if(!email.trim()) { setMessage("Enter a business email before saving."); return; }
    if(websiteError) { setMessage("Enter a complete website address beginning with https://."); return; }
    if(brochureUrlError) { setMessage("Use a complete https:// link for the custom brochure."); return; }
    const invalidLocation=locations.find((location)=>!location.name.trim()||!location.address?.line1?.trim()||!location.address?.city?.trim()||!location.address?.state?.trim()||!location.address?.postal_code?.trim()||!location.phone?.trim()||!validPhone(location.phone??"")||!validPostalCode(location.address?.postal_code??""));
    if(invalidLocation){setMessage(`Complete ${invalidLocation.name||"this location"}: name, address, city, state, 6-digit postal code and a valid phone number are required.`);return;}
    if(locations.some((location)=>!validHttps(location.google_maps_url??""))){setMessage("Use a complete https:// Google Maps link for each location.");return;}
    if(!services.length || services.some((service)=>!service.name.trim())) { setMessage("Add at least one service with a name before saving."); return; }
    const invalidIdentity=category==="Healthcare"&&resources.find((item)=>item.name.trim().length<2||/^(primary provider|provider|doctor\s*\d*)$/i.test(item.name.trim()));
    if(invalidIdentity){setMessage("Enter each doctor’s real full name before saving. This name is used in bookings and patient communications.");return;}
    setBusy(true);
    const invalidProvider=providers.find((item)=>!validWhatsapp(item.contact_phone));
    if(invalidProvider){
      const providerName=resources.find((item)=>item.id===invalidProvider.resource_id)?.name??"Provider";
      setMessage(`${providerName}: enter the WhatsApp number in international format, for example +919831582626.`);
      setBusy(false);
      return;
    }
    if(category==="Healthcare"&&clinicMode==="multi_doctor_clinic"&&!departments.some(item=>item.active&&item.name.trim().length>=2)){setMessage("Add at least one active department for a multi-doctor clinic.");setBusy(false);return}
    const supabase = createClient();
    try {
      const resourceResults=await Promise.all(resources.map((item)=>item.isNew
        ? supabase.from("booking_resources").insert({id:item.id,organization_id:organization.id,name:item.name.trim(),resource_type:"doctor",timezone:item.timezone}).select()
        : supabase.from("booking_resources").update({name:item.name.trim(),updated_at:new Date().toISOString()}).eq("id",item.id).eq("organization_id",organization.id).select()
      ));
      const resourceFailure=resourceResults.find((result)=>result.error);
      if(resourceFailure?.error)throw resourceFailure.error;
      const coreResults = await Promise.all([
        supabase.from("organizations").update({
          name,
          extra: {
            ...extra,
            business_category: category,
            onboarding_status: "foundation_complete",
            roster_dispatch: {
              enabled: dispatchEnabled,
              dispatch_time: dispatchTime,
              clinic_email: dispatchClinicEmail.trim() || null,
              send_to_clinic: sendToClinic,
              send_to_doctors: sendToDoctors,
            },
          },
          updated_at: new Date().toISOString(),
        }).eq("id", organization.id),
        supabase.from("onboarding_profiles").update({
          business_name: name, business_category: category, description,
          clinic_mode:clinicMode,
          primary_phone: phone || null, email: email || null, website: website || null,
          custom_brochure_url:customBrochureUrl.trim()||null,custom_brochure_storage_path:customBrochureUrl.trim()?null:(customBrochurePath||null),
          updated_at: new Date().toISOString(),
        }).eq("organization_id", organization.id),
        ...providers.map((item)=>supabase.from("provider_profiles").upsert({
          resource_id:item.resource_id,organization_id:organization.id,photo_path:item.photo_path,
          specialization:item.specialization||null,qualifications:item.qualifications||null,
          registration_number:item.registration_number||null,experience_years:item.experience_years,
          languages:item.languages,biography:item.biography||null,
          contact_phone:item.contact_phone?.replace(/[\s()-]/g,"")||null,contact_email:item.contact_email||null,
          updated_at:new Date().toISOString(),
        },{onConflict:"resource_id"})),
        ...departments.map((item)=>supabase.from("clinic_departments").upsert({id:item.id,organization_id:organization.id,name:item.name.trim(),code:item.code||null,description:item.description||null,active:item.active,sort_order:item.sort_order,updated_at:new Date().toISOString()},{onConflict:"id"})),
      ]);
      const failure = coreResults.find((result) => result.error);
      if (failure?.error) throw failure.error;
      const locationResults = await Promise.all(locations.map((location) => location.id
        ? supabase.from("business_locations").update({
            name: location.name, location_type: location.location_type, phone: location.phone || null,
            address: location.address, google_maps_url:location.google_maps_url?.trim()||null, timezone: location.timezone, updated_at: new Date().toISOString(),
          }).eq("id", location.id).eq("organization_id", organization.id).select()
        : supabase.from("business_locations").insert({
            organization_id: organization.id, name: location.name, location_type: location.location_type,
            phone: location.phone || null, address: location.address, google_maps_url:location.google_maps_url?.trim()||null, timezone: location.timezone,
          }).select()));
      const locationFailure = locationResults.find((result) => result.error);
      if (locationFailure?.error) throw locationFailure.error;
      const savedLocations = locationResults.map((result, index) => {
        const saved = result.data?.[0];
        if (!saved) throw new Error(`Unable to confirm that chamber ${index + 1} was saved.`);
        return saved as Location;
      });
      const serviceResults = await Promise.all(services.map((service) => service.id
        ? supabase.from("organization_services").update({
            name: service.name, service_type: service.service_type, description: service.description || null,
            duration_minutes: service.duration_minutes, buffer_minutes: service.buffer_minutes ?? 0,
            price_paise: service.price_paise ?? null, booking_enabled: service.booking_enabled ?? true,
            updated_at: new Date().toISOString(),
          }).eq("id", service.id).eq("organization_id", organization.id).select()
        : supabase.from("organization_services").insert({
            organization_id: organization.id, name: service.name, service_type: service.service_type,
            description: service.description || null, duration_minutes: service.duration_minutes,
            buffer_minutes: service.buffer_minutes ?? 0, price_paise: service.price_paise ?? null,
            booking_enabled: service.booking_enabled ?? true,
          }).select()));
      const serviceFailure = serviceResults.find((result) => result.error);
      if (serviceFailure?.error) throw serviceFailure.error;
      const savedServices = serviceResults.map((result, index) => {
        const saved = result.data?.[0];
        if (!saved) throw new Error(`Unable to confirm that service ${index + 1} was saved.`);
        return saved as Service;
      });
      const {error:clearError}=await supabase.from("provider_departments").delete().eq("organization_id",organization.id);
      if(clearError)throw clearError;
      const departmentLinks=Object.entries(providerDepartmentMap).flatMap(([resourceId,departmentIds])=>departmentIds.map((departmentId,index)=>({organization_id:organization.id,resource_id:resourceId,department_id:departmentId,primary_department:index===0})));
      if(departmentLinks.length){const {error:linkError}=await supabase.from("provider_departments").insert(departmentLinks);if(linkError)throw linkError}
      setLocations(savedLocations);
      setServices(savedServices);
      setResources((current)=>current.map((item)=>({...item,isNew:false})));
      setMessage("Business setup saved. Provider names, chambers and services are ready to schedule without reloading this page.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save setup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="foundation-form mx-auto grid max-w-7xl gap-5 pb-12" onSubmit={save}>
      <section className="foundation-section">
        <header><div><span className="app-eyebrow">BUSINESS PROFILE</span><h2>Tell OmniRelay how your business operates</h2></div><span className="section-status">Required</span></header><p className="required-note"><Required /> Required to set up booking and customer communication.</p>
        <div className="form-grid">
          <label>Business name<Required /><input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} aria-invalid={!name.trim()}/></label>
          <label>Category<Required /><select value={category} onChange={(e) => setCategory(e.target.value)} required>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="wide">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What do you offer and who do you serve?" /></label>
          <label>Business phone<Required /><input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98315 82626" required aria-invalid={Boolean(businessPhoneError)} />{businessPhoneError&&<small className="field-error">Use 8–15 digits; you may include +, spaces, brackets or hyphens.</small>}</label>
          <label>Business email<Required /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="care@business.com" required aria-invalid={!email.trim()} /></label>
          <label className="wide">Website<input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourbusiness.com" aria-invalid={Boolean(websiteError)} />{websiteError&&<small className="field-error">Enter the full address, for example https://yourbusiness.com.</small>}</label>
        </div>
      </section>

      {category==="Healthcare"&&<section className="foundation-section">
        <header><div><span className="app-eyebrow">CLINIC OPERATING MODEL</span><h2>Solo or multi-doctor booking</h2></div><span className="section-status">Workflow routing</span></header>
        <div className="form-grid"><label>Clinic type<select value={clinicMode} onChange={(e)=>setClinicMode(e.target.value)}><option value="solo_practitioner">Solo practitioner</option><option value="multi_doctor_clinic">Multi-doctor clinic / polyclinic</option><option value="diagnostic_centre">Diagnostic centre</option></select><small className="field-help">Solo mode bypasses department and doctor selection. Multi-doctor mode enables department-based routing.</small></label></div>
        {clinicMode==="multi_doctor_clinic"&&<div className="editor-stack"><header><div><b>Departments and specialties</b><span>Patients choose a department before seeing eligible doctors.</span></div><button type="button" className="secondary-button" onClick={()=>setDepartments([...departments,{id:crypto.randomUUID(),name:`Department ${departments.length+1}`,code:null,description:null,active:true,sort_order:departments.length}])}>+ Add department</button></header>{departments.map((item,index)=><article className="editor-card" key={item.id}><div className="form-grid"><label>Department name<input value={item.name} onChange={(e)=>setDepartments(departments.map((row,i)=>i===index?{...row,name:e.target.value}:row))} placeholder="Cardiology" required/></label><label>Short code<input value={item.code??""} onChange={(e)=>setDepartments(departments.map((row,i)=>i===index?{...row,code:e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g,"")||null}:row))} placeholder="cardiology"/></label><label className="wide">Description<input value={item.description??""} onChange={(e)=>setDepartments(departments.map((row,i)=>i===index?{...row,description:e.target.value||null}:row))} placeholder="Optional patient-facing description"/></label><label><input type="checkbox" checked={item.active} onChange={(e)=>setDepartments(departments.map((row,i)=>i===index?{...row,active:e.target.checked}:row))}/> Active for booking</label></div></article>)}</div>}
      </section>}

      <section className="foundation-section">
        <header><div><span className="app-eyebrow">DOCTOR & STAFF PROFILE</span><h2>Build the public provider identity</h2></div><span className="section-status">Patient-facing</span></header>
        {resources.length ? <div className="provider-editor">
          <div className="provider-toolbar"><label className="provider-picker">{category==="Healthcare"?"Doctor":"Provider"}<select value={providerId} onChange={(e)=>chooseProvider(e.target.value)}>{resources.map((item)=><option value={item.id} key={item.id}>{item.name.trim()||"New doctor"}</option>)}</select></label>{category==="Healthcare"&&<button type="button" className="secondary-button" onClick={addDoctor}>+ Add doctor</button>}</div>
          <div className="provider-main">
          <div className="provider-photo-editor">
            <div className="provider-photo-preview">{photoPreview?<img src={photoPreview} alt="New provider preview"/>:provider.photo_path?<img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/provider-photos/${provider.photo_path}`} alt="Provider"/>:<span>{resources.find((item)=>item.id===providerId)?.name.slice(0,1)??"P"}</span>}</div>
            <label className="secondary-button">Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>{const file=e.target.files?.[0];if(file)void uploadProviderPhoto(file)}}/></label>
            <small>JPG, PNG or WebP · maximum 5 MB</small>
          </div>
          <div className="provider-details">
            <div className="provider-contact-note"><b>Provider-specific settings</b><span>Each doctor or diagnostic professional keeps an independent registration, WhatsApp number and notification consent.</span></div>
            <div className="form-grid provider-fields">
              <label className="wide">{category==="Healthcare"?"Doctor’s full name":"Provider name"}<Required /><input value={resources.find((item)=>item.id===providerId)?.name??""} onChange={(e)=>renameProvider(e.target.value)} placeholder={category==="Healthcare"?"Dr Khurshid Alam":"Full name"} required/><small className="field-help">This patient-facing name appears in booking, reminders and emergency notices.</small></label>
              <label>Specialisation<input value={provider.specialization??""} onChange={(e)=>setProvider({...provider,specialization:e.target.value})} placeholder="Cardiologist"/></label>
              {clinicMode==="multi_doctor_clinic"&&<fieldset className="wide"><legend>Departments</legend><div className="flex flex-wrap gap-3 pt-2">{departments.filter(item=>item.active).map(item=>{const checked=(providerDepartmentMap[providerId]??[]).includes(item.id);return <label className="inline-flex items-center gap-2" key={item.id}><input type="checkbox" checked={checked} onChange={(e)=>setProviderDepartmentMap({...providerDepartmentMap,[providerId]:e.target.checked?[...(providerDepartmentMap[providerId]??[]),item.id]:(providerDepartmentMap[providerId]??[]).filter(id=>id!==item.id)})}/>{item.name}</label>})}</div><small className="field-help">Select every department where this doctor accepts bookings. The first selected department is the Primary department.</small></fieldset>}
              <label>Qualifications<input value={provider.qualifications??""} onChange={(e)=>setProvider({...provider,qualifications:e.target.value})} placeholder="MBBS, MD"/></label>
              <label>Medical registration number<input value={provider.registration_number??""} onChange={(e)=>setProvider({...provider,registration_number:e.target.value})} placeholder="Medical council registration"/><small className="field-help">Do not enter a phone number here.</small></label>
              <label>Years of experience<input type="number" min="0" max="80" value={provider.experience_years??""} onChange={(e)=>setProvider({...provider,experience_years:e.target.value?Number(e.target.value):null})}/></label>
              <label>Doctor WhatsApp number<input type="tel" inputMode="tel" value={provider.contact_phone??""} onChange={(e)=>setProvider({...provider,contact_phone:e.target.value})} placeholder="+919831582626"/><small className="field-help">Used only after the provider’s queue-notification consent is recorded.</small></label>
              <label>Provider email<input type="email" value={provider.contact_email??""} onChange={(e)=>setProvider({...provider,contact_email:e.target.value})} placeholder="doctor@clinic.com"/></label>
              <label className="wide">Languages<input value={provider.languages.join(", ")} onChange={(e)=>setProvider({...provider,languages:e.target.value.split(",").map((item)=>item.trim()).filter(Boolean)})} placeholder="English, Bengali, Hindi"/></label>
              <label className="wide">Public biography<textarea value={provider.biography??""} onChange={(e)=>setProvider({...provider,biography:e.target.value})} placeholder="A short patient-friendly introduction."/></label>
            </div>
            <section className="public-brochure-control">
              <div><b>Doctor directory & brochure</b><span>Patients receive this custom brochure when set. Otherwise OmniRelay creates a current directory PDF from the doctors and locations below.</span></div>
              <div className="form-grid">
                <label className="wide">Custom brochure link (optional)<input type="url" value={customBrochureUrl} onChange={(e)=>setCustomBrochureUrl(e.target.value)} placeholder="https://your-clinic.com/doctor-directory.pdf" aria-invalid={brochureUrlError}/><small className="field-help">Use a public HTTPS PDF link. It replaces the generated brochure until removed.</small></label>
                <label className="secondary-button brochure-upload">Upload PDF brochure<input type="file" accept="application/pdf" onChange={(e)=>{const file=e.target.files?.[0];if(file)void uploadClinicBrochure(file)}}/></label>
                {customBrochurePath&&<span className="brochure-status">Custom PDF ready</span>}
              </div>
            </section>
          </div>
          </div>
        </div>:<p className="provider-note">A bookable provider will appear here after the initial workspace setup.</p>}
      </section>

      <section className="foundation-section">
        <header><div><span className="app-eyebrow">LOCATIONS</span><h2>Chambers, branches and service points</h2></div><button type="button" className="secondary-button" onClick={() => setLocations([...locations, { name: `Location ${locations.length + 1}`, location_type: category === "Healthcare" ? "chamber" : "branch", phone: "", timezone: "Asia/Kolkata", address: {} }])}>+ Add location</button></header><p className="required-note"><Required /> Required for each location that accepts bookings.</p>
        <div className="editor-stack">{locations.map((location, index) => <article className="editor-card" key={location.id ?? index}>
          <div className="form-grid">
            <label>Location name<Required /><input value={location.name} onChange={(e) => changeLocation(index, { name: e.target.value })} required minLength={2} aria-invalid={!location.name.trim()} /></label>
            <label>Type<Required /><select value={location.location_type} onChange={(e) => changeLocation(index, { location_type: e.target.value })} required>{["chamber","clinic","branch","restaurant","virtual"].map((item)=><option key={item}>{item}</option>)}</select></label>
            <label className="wide">Address<Required /><input value={location.address?.line1 ?? ""} onChange={(e) => changeAddress(index, { line1: e.target.value })} placeholder="Street, building, landmark" required /></label>
            <label>City<Required /><input value={location.address?.city ?? ""} onChange={(e) => changeAddress(index, { city: e.target.value })} required /></label>
            <label>State<Required /><input value={location.address?.state ?? ""} onChange={(e) => changeAddress(index, { state: e.target.value })} required /></label>
            <label>Postal code<Required /><input inputMode="numeric" maxLength={6} value={location.address?.postal_code ?? ""} onChange={(e) => changeAddress(index, { postal_code: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="700066" required aria-invalid={Boolean(!location.address?.postal_code||!validPostalCode(location.address.postal_code))} />{location.address?.postal_code&&!validPostalCode(location.address.postal_code)&&<small className="field-error">Enter a 6-digit postal code.</small>}</label>
            <label>Location phone<Required /><input type="tel" inputMode="tel" value={location.phone ?? ""} onChange={(e) => changeLocation(index, { phone: e.target.value })} placeholder="+91 98315 82626" required aria-invalid={Boolean(!location.phone||!validPhone(location.phone))} />{location.phone&&!validPhone(location.phone)&&<small className="field-error">Enter an 8–15 digit phone number.</small>}</label>
            <label className="wide">Google Maps share link<input type="url" value={location.google_maps_url??""} onChange={(e)=>changeLocation(index,{google_maps_url:e.target.value})} placeholder="https://share.google/..."/><small className="field-help">Shown in WhatsApp clinic timings and the public directory as a tappable map link.</small></label>
          </div>
        </article>)}</div>
      </section>

      <section className="foundation-section">
        <header><div><span className="app-eyebrow">SERVICES</span><h2>What customers can book</h2></div><button type="button" className="secondary-button" onClick={() => setServices([...services, { name: "New service", service_type: "appointment", duration_minutes: 30, buffer_minutes: 0, price_paise: null, booking_enabled: true }])}>+ Add service</button></header><p className="required-note"><Required /> Add at least one bookable service to start accepting appointments.</p>
        <div className="editor-stack">{services.map((service, index) => <article className="editor-card" key={service.id ?? index}>
          <div className="form-grid">
            <label>Service name<Required /><input value={service.name} onChange={(e) => changeService(index, { name: e.target.value })} required /></label>
            <label>Duration<Required /><select value={service.duration_minutes} onChange={(e) => changeService(index, { duration_minutes: Number(e.target.value) })} required>{[15,30,45,60,90,120].map((item)=><option key={item} value={item}>{item} minutes</option>)}</select></label>
            <label>Price (₹)<input type="number" min="0" value={service.price_paise == null ? "" : service.price_paise / 100} onChange={(e) => changeService(index, { price_paise: e.target.value ? Number(e.target.value) * 100 : null })} /></label>
            <label>Buffer<select value={service.buffer_minutes ?? 0} onChange={(e) => changeService(index, { buffer_minutes: Number(e.target.value) })}>{[0,5,10,15,30].map((item)=><option key={item} value={item}>{item} minutes</option>)}</select></label>
            <label className="wide">Description<input value={service.description ?? ""} onChange={(e) => changeService(index, { description: e.target.value })} placeholder="What is included?" /></label>
          </div>
        </article>)}</div>
      </section>
      <ChamberScheduleEditor organizationId={organization.id} resources={resources} locations={locations} services={services} assignments={assignments} assignmentServices={assignmentServices} chamberRules={chamberRules} paymentGateway={paymentGateway} calendarConnections={calendarConnections}/>

      <section className="foundation-section">
        <header><div><span className="app-eyebrow">INTEGRATIONS</span><h2>Clinic-wide Connections</h2></div></header>
        <div className="integration-grid">
          <article>
            <i>📅</i>
            <b>Google Calendar (Shared Clinic)<small>Sync all clinic appointments to a central calendar.</small></b>
            {calendarConnections?.some(c => c.resource_id === null) ? (
              <span className="connected">Connected</span>
            ) : (
              <a href={`/api/auth/google-calendar?organizationId=${organization.id}`} className="secondary-button" style={{textDecoration: 'none'}}>Connect</a>
            )}
          </article>
        </div>
      </section>

      <section className="foundation-section" id="roster-dispatch-settings">
        <header>
          <div>
            <span className="app-eyebrow">AUTOMATED OPERATIONS</span>
            <h2>Daily Patient Booking Roster & Email Dispatch</h2>
          </div>
          <span className="section-status" style={{background: dispatchEnabled ? "#ecfdf5" : "#f1f5f9", color: dispatchEnabled ? "#059669" : "#64748b"}}>
            {dispatchEnabled ? "Automated Dispatch Active" : "Dispatch Disabled"}
          </span>
        </header>
        <p className="required-note">Automatically email the daily booking sheet to clinic reception and personal schedules to each doctor before closing.</p>
        <div className="editor-card">
          <div className="form-grid">
            <label className="wide inline-flex items-center gap-2 font-bold cursor-pointer">
              <input type="checkbox" checked={dispatchEnabled} onChange={(e)=>setDispatchEnabled(e.target.checked)}/>
              Enable automated daily booking email dispatch
            </label>
            <label>
              Preferred dispatch time (IST)
              <select value={dispatchTime} onChange={(e)=>setDispatchTime(e.target.value)} disabled={!dispatchEnabled}>
                <option value="17:00">05:00 PM (Early Evening)</option>
                <option value="18:00">06:00 PM</option>
                <option value="19:00">07:00 PM (Clinic Closing)</option>
                <option value="20:00">08:00 PM (Standard EOD)</option>
                <option value="21:00">09:00 PM (Night Summary)</option>
                <option value="22:00">10:00 PM</option>
              </select>
              <small className="field-help">Cron checks every hour and triggers organizations matching this window.</small>
            </label>
            <label>
              Clinic recipient email
              <input
                type="email"
                value={dispatchClinicEmail}
                onChange={(e)=>setDispatchClinicEmail(e.target.value)}
                placeholder={email || "reception@clinic.com"}
                disabled={!dispatchEnabled}
              />
              <small className="field-help">Leave empty to use primary clinic email ({email || "not configured"}).</small>
            </label>
            <label className="wide inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={sendToClinic}
                onChange={(e)=>setSendToClinic(e.target.checked)}
                disabled={!dispatchEnabled}
              />
              Send master summary & attached spreadsheet to Clinic Email
            </label>
            <label className="wide inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={sendToDoctors}
                onChange={(e)=>setSendToDoctors(e.target.checked)}
                disabled={!dispatchEnabled}
              />
              Send doctor-specific personal schedules to each doctor&apos;s registered email
            </label>
          </div>
          <div style={{marginTop:"16px",paddingTop:"14px",borderTop:"1px solid #e2e8f0",display:"flex",gap:"12px",alignItems:"center",flexWrap:"wrap"}}>
            <button
              type="button"
              className="secondary-button"
              disabled={dispatchingTest}
              onClick={testDispatch}
            >
              {dispatchingTest ? "Testing Dispatch..." : "✉️ Send Test Dispatch Now"}
            </button>
            <small style={{color:"#64748b"}}>Simulates the evening dispatch immediately for today&apos;s roster without waiting for cron.</small>
          </div>
          {dispatchNotice && <p className="form-message" style={{marginTop:"12px"}} role="status">{dispatchNotice}</p>}
        </div>
      </section>

      <div className="save-bar"><div><b>Workspace foundation</b><span>Used by appointments, AI agents and automations</span></div><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save business setup"}</button></div>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  );
}
