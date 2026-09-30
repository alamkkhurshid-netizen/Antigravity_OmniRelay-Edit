import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Department, Location, ProviderProfile, Resource, Service, emptyProvider } from "./types";
import { validHttps, validPhone, validPostalCode, validWebsite, validWhatsapp } from "./utils";

export function useWorkspaceSettings(
  organization: { id: string; name: string; extra: Record<string, unknown> | null },
  profile: Record<string, unknown> | null,
  initialLocations: Location[],
  initialServices: Service[],
  initialResources: Resource[],
  initialProviderProfiles: ProviderProfile[],
  initialDepartments: Department[],
  providerDepartments: Array<{ department_id: string; resource_id: string; primary_department: boolean }>
) {
  const extra = organization.extra ?? {};
  const [name, setName] = useState(organization.name);
  const [category, setCategory] = useState(String(profile?.business_category ?? extra.business_category ?? "Other"));
  const [description, setDescription] = useState(String(profile?.description ?? ""));
  const [clinicMode, setClinicMode] = useState(String(profile?.clinic_mode ?? "solo_practitioner"));
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [providerDepartmentMap, setProviderDepartmentMap] = useState<Record<string, string[]>>(() => providerDepartments.reduce<Record<string, string[]>>((map, item) => { (map[item.resource_id] ??= []).push(item.department_id); return map; }, {}));
  const [phone, setPhone] = useState(String(profile?.primary_phone ?? ""));
  const [email, setEmail] = useState(String(profile?.email ?? ""));
  const [website, setWebsite] = useState(String(profile?.website ?? ""));
  const [customBrochureUrl, setCustomBrochureUrl] = useState(String(profile?.custom_brochure_url ?? ""));
  const [customBrochurePath, setCustomBrochurePath] = useState(String(profile?.custom_brochure_storage_path ?? ""));
  const [locations, setLocations] = useState<Location[]>(initialLocations);
  const [services, setServices] = useState<Service[]>(initialServices);
  const [resources, setResources] = useState<Resource[]>(initialResources);
  const [providerId, setProviderId] = useState(initialResources[0]?.id ?? "");
  const [providers, setProviders] = useState<ProviderProfile[]>(initialProviderProfiles);
  const provider = providers.find((item) => item.resource_id === providerId) ?? emptyProvider(providerId);
  const [photoPreview, setPhotoPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const businessPhoneError = Boolean(!phone.trim() || !validPhone(phone));
  const websiteError = Boolean(website.trim() && !validWebsite(website));
  const brochureUrlError = Boolean(!validHttps(customBrochureUrl));

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
  const changeAddress = (index: number, patch: Partial<Location["address"]>) =>
    setLocations((items) => items.map((item, i) => i === index ? { ...item, address: { ...item.address, ...patch } } : item));
  const changeService = (index: number, patch: Partial<Service>) =>
    setServices((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));

  function chooseProvider(id: string) {
    setProviderId(id);
    setPhotoPreview("");
  }
  function setProvider(next: ProviderProfile) {
    setProviders((current) => current.some((item) => item.resource_id === next.resource_id) ? current.map((item) => item.resource_id === next.resource_id ? next : item) : [...current, next]);
  }
  function renameProvider(nextName: string) {
    setResources((current) => current.map((item) => item.id === providerId ? { ...item, name: nextName } : item));
  }
  function addDoctor() {
    const id = crypto.randomUUID();
    setResources((current) => [...current, { id, name: "", resource_type: "doctor", timezone: "Asia/Kolkata", isNew: true }]);
    setProviderId(id);
    setPhotoPreview("");
  }

  async function uploadProviderPhoto(file: File) {
    if (!providerId) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setMessage("Use a JPG, PNG or WebP image smaller than 5 MB."); return; }
    setBusy(true); setMessage("");
    const supabase = createClient();
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${organization.id}/providers/${providerId}-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("provider-photos").upload(path, file, { upsert: false, contentType: file.type });
    if (error) { setMessage(error.message); setBusy(false); return; }
    setProvider({ ...provider, photo_path: path });
    setPhotoPreview(URL.createObjectURL(file));
    setBusy(false);
  }

  async function uploadClinicBrochure(file: File) {
    if (file.type !== "application/pdf" || file.size <= 0 || file.size > 10 * 1024 * 1024) { setMessage("Upload a PDF brochure up to 10 MB."); return; }
    setBusy(true); setMessage("");
    const path = `${organization.id}/brochures/${crypto.randomUUID()}.pdf`;
    const { error } = await createClient().storage.from("clinic-brochures").upload(path, file, { upsert: false, contentType: "application/pdf" });
    if (error) { setMessage(error.message); setBusy(false); return; }
    if (customBrochurePath) await createClient().storage.from("clinic-brochures").remove([customBrochurePath]);
    setCustomBrochurePath(path); setCustomBrochureUrl(""); setMessage("Custom brochure uploaded. Select Save business setup to publish it."); setBusy(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!name.trim()) { setMessage("Enter your business name before saving."); return; }
    if (businessPhoneError) { setMessage("Enter a valid business phone number (8–15 digits, with country code if available)."); return; }
    if (!email.trim()) { setMessage("Enter a business email before saving."); return; }
    if (websiteError) { setMessage("Enter a complete website address beginning with https://."); return; }
    if (brochureUrlError) { setMessage("Use a complete https:// link for the custom brochure."); return; }
    
    const invalidLocation = locations.find((location) => !location.name.trim() || !location.address?.line1?.trim() || !location.address?.city?.trim() || !location.address?.state?.trim() || !location.address?.postal_code?.trim() || !location.phone?.trim() || !validPhone(location.phone ?? "") || !validPostalCode(location.address?.postal_code ?? ""));
    if (invalidLocation) { setMessage(`Complete ${invalidLocation.name || "this location"}: name, address, city, state, 6-digit postal code and a valid phone number are required.`); return; }
    
    if (locations.some((location) => !validHttps(location.google_maps_url ?? ""))) { setMessage("Use a complete https:// Google Maps link for each location."); return; }
    if (!services.length || services.some((service) => !service.name.trim())) { setMessage("Add at least one service with a name before saving."); return; }
    
    const invalidIdentity = category === "Healthcare" && resources.find((item) => item.name.trim().length < 2 || /^(primary provider|provider|doctor\s*\d*)$/i.test(item.name.trim()));
    if (invalidIdentity) { setMessage("Enter each doctor’s real full name before saving. This name is used in bookings and patient communications."); return; }
    
    setBusy(true);
    const invalidProvider = providers.find((item) => !validWhatsapp(item.contact_phone));
    if (invalidProvider) {
      const providerName = resources.find((item) => item.id === invalidProvider.resource_id)?.name ?? "Provider";
      setMessage(`${providerName}: enter the WhatsApp number in international format, for example +919831582626.`);
      setBusy(false);
      return;
    }
    
    if (category === "Healthcare" && clinicMode === "multi_doctor_clinic" && !departments.some(item => item.active && item.name.trim().length >= 2)) { setMessage("Add at least one active department for a multi-doctor clinic."); setBusy(false); return; }
    
    const supabase = createClient();
    try {
      const resourceResults = await Promise.all(resources.map((item) => item.isNew
        ? supabase.from("booking_resources").insert({ id: item.id, organization_id: organization.id, name: item.name.trim(), resource_type: "doctor", timezone: item.timezone }).select()
        : supabase.from("booking_resources").update({ name: item.name.trim(), updated_at: new Date().toISOString() }).eq("id", item.id).eq("organization_id", organization.id).select()
      ));
      const resourceFailure = resourceResults.find((result) => result.error);
      if (resourceFailure?.error) throw resourceFailure.error;

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
          clinic_mode: clinicMode,
          primary_phone: phone || null, email: email || null, website: website || null,
          custom_brochure_url: customBrochureUrl.trim() || null, custom_brochure_storage_path: customBrochureUrl.trim() ? null : (customBrochurePath || null),
          updated_at: new Date().toISOString(),
        }).eq("organization_id", organization.id),
        ...providers.map((item) => supabase.from("provider_profiles").upsert({
          resource_id: item.resource_id, organization_id: organization.id, photo_path: item.photo_path,
          specialization: item.specialization || null, qualifications: item.qualifications || null,
          registration_number: item.registration_number || null, experience_years: item.experience_years,
          languages: item.languages, biography: item.biography || null,
          contact_phone: item.contact_phone?.replace(/[\s()-]/g, "") || null, contact_email: item.contact_email || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "resource_id" })),
        ...departments.map((item) => supabase.from("clinic_departments").upsert({ id: item.id, organization_id: organization.id, name: item.name.trim(), code: item.code || null, description: item.description || null, active: item.active, sort_order: item.sort_order, updated_at: new Date().toISOString() }, { onConflict: "id" })),
      ]);
      const failure = coreResults.find((result) => result.error);
      if (failure?.error) throw failure.error;

      const locationResults = await Promise.all(locations.map((location) => location.id
        ? supabase.from("business_locations").update({
          name: location.name, location_type: location.location_type, phone: location.phone || null,
          address: location.address, google_maps_url: location.google_maps_url?.trim() || null, timezone: location.timezone, updated_at: new Date().toISOString(),
        }).eq("id", location.id).eq("organization_id", organization.id).select()
        : supabase.from("business_locations").insert({
          organization_id: organization.id, name: location.name, location_type: location.location_type,
          phone: location.phone || null, address: location.address, google_maps_url: location.google_maps_url?.trim() || null, timezone: location.timezone,
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

      const { error: clearError } = await supabase.from("provider_departments").delete().eq("organization_id", organization.id);
      if (clearError) throw clearError;
      const departmentLinks = Object.entries(providerDepartmentMap).flatMap(([resourceId, departmentIds]) => departmentIds.map((departmentId, index) => ({ organization_id: organization.id, resource_id: resourceId, department_id: departmentId, primary_department: index === 0 })));
      if (departmentLinks.length) { const { error: linkError } = await supabase.from("provider_departments").insert(departmentLinks); if (linkError) throw linkError; }

      setLocations(savedLocations);
      setServices(savedServices);
      setResources((current) => current.map((item) => ({ ...item, isNew: false })));
      setMessage("Business setup saved. Provider names, chambers and services are ready to schedule without reloading this page.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save setup.");
    } finally {
      setBusy(false);
    }
  }

  return {
    name, setName, category, setCategory, description, setDescription,
    clinicMode, setClinicMode, departments, setDepartments,
    providerDepartmentMap, setProviderDepartmentMap,
    phone, setPhone, email, setEmail, website, setWebsite,
    customBrochureUrl, setCustomBrochureUrl, customBrochurePath,
    locations, setLocations, services, setServices, resources, setResources,
    providerId, setProviderId, providers, setProviders, provider,
    photoPreview, setPhotoPreview, busy, setBusy, message, setMessage,
    businessPhoneError, websiteError, brochureUrlError,
    dispatchEnabled, setDispatchEnabled, dispatchTime, setDispatchTime,
    dispatchClinicEmail, setDispatchClinicEmail, sendToClinic, setSendToClinic,
    sendToDoctors, setSendToDoctors, dispatchNotice, dispatchingTest, testDispatch,
    changeLocation, changeAddress, changeService, chooseProvider, setProvider, renameProvider, addDoctor, uploadProviderPhoto, uploadClinicBrochure, save,
    organizationId: organization.id
  };
}
