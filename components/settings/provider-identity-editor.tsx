"use client";

import { Department, ProviderProfile, Resource } from "@/app/app/settings/types";
import { Required } from "@/app/app/settings/utils";

interface ProviderIdentityEditorProps {
  category: string;
  resources: Resource[];
  providerId: string;
  chooseProvider: (val: string) => void;
  addDoctor: () => void;
  photoPreview: string;
  provider: ProviderProfile;
  uploadProviderPhoto: (file: File) => void;
  renameProvider: (name: string) => void;
  setProvider: (val: ProviderProfile) => void;
  clinicMode: string;
  departments: Department[];
  providerDepartmentMap: Record<string, string[]>;
  setProviderDepartmentMap: (val: Record<string, string[]>) => void;
  customBrochureUrl: string;
  setCustomBrochureUrl: (val: string) => void;
  brochureUrlError: boolean;
  uploadClinicBrochure: (file: File) => void;
  customBrochurePath: string;
}

export function ProviderIdentityEditor({
  category, resources, providerId, chooseProvider, addDoctor,
  photoPreview, provider, uploadProviderPhoto, renameProvider,
  setProvider, clinicMode, departments, providerDepartmentMap, setProviderDepartmentMap,
  customBrochureUrl, setCustomBrochureUrl, brochureUrlError, uploadClinicBrochure, customBrochurePath
}: ProviderIdentityEditorProps) {
  return (
    <section className="foundation-section">
      <header>
        <div>
          <span className="app-eyebrow">{category === "Healthcare" ? "DOCTOR & STAFF PROFILE" : "STAFF & PROVIDER PROFILE"}</span>
          <h2>Build the public provider identity</h2>
        </div>
        <span className="section-status">Patient-facing</span>
      </header>
      {resources.length ? (
        <div className="provider-editor">
          <div className="provider-toolbar">
            <label className="provider-picker">
              {category === "Healthcare" ? "Doctor" : "Provider"}
              <select value={providerId} onChange={(e) => chooseProvider(e.target.value)}>
                {resources.map((item) => (
                  <option value={item.id} key={item.id}>{item.name.trim() || (category === "Healthcare" ? "New doctor" : "New provider")}</option>
                ))}
              </select>
            </label>
            {category === "Healthcare" && <button type="button" className="secondary-button" onClick={addDoctor}>+ Add doctor</button>}
          </div>
          <div className="provider-main">
            <div className="provider-photo-editor">
              <div className="provider-photo-preview">
                {photoPreview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={photoPreview} alt="New provider preview" />
                ) : provider.photo_path ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/provider-photos/${provider.photo_path}`} alt="Provider" />
                ) : (
                  <span>{resources.find((item) => item.id === providerId)?.name.slice(0, 1) ?? "P"}</span>
                )}
              </div>
              <label className="secondary-button">
                Upload photo
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadProviderPhoto(file); }} />
              </label>
              <small>JPG, PNG or WebP · maximum 5 MB</small>
            </div>
            <div className="provider-details">
              <div className="provider-contact-note">
                <b>Provider-specific settings</b>
                <span>{category === "Healthcare" ? "Each doctor or diagnostic professional keeps an independent registration, WhatsApp number and notification consent." : "Each provider or staff member keeps an independent registration, WhatsApp number and notification consent."}</span>
              </div>
              <div className="form-grid provider-fields">
                <label className="wide">
                  {category === "Healthcare" ? "Doctor’s full name" : "Provider name"}<Required />
                  <input value={resources.find((item) => item.id === providerId)?.name ?? ""} onChange={(e) => renameProvider(e.target.value)} placeholder={category === "Healthcare" ? "Dr Khurshid Alam" : "Full name"} required />
                  <small className="field-help">This patient-facing name appears in booking, reminders and emergency notices.</small>
                </label>
                <label>
                  Specialisation
                  <input value={provider.specialization ?? ""} onChange={(e) => setProvider({ ...provider, specialization: e.target.value })} placeholder="Cardiologist" />
                </label>
                {clinicMode === "multi_doctor_clinic" && (
                  <fieldset className="wide">
                    <legend>Departments</legend>
                    <div className="flex flex-wrap gap-3 pt-2">
                      {departments.filter(item => item.active).map(item => {
                        const checked = (providerDepartmentMap[providerId] ?? []).includes(item.id);
                        return (
                          <label className="inline-flex items-center gap-2" key={item.id}>
                            <input type="checkbox" checked={checked} onChange={(e) => setProviderDepartmentMap({ ...providerDepartmentMap, [providerId]: e.target.checked ? [...(providerDepartmentMap[providerId] ?? []), item.id] : (providerDepartmentMap[providerId] ?? []).filter(id => id !== item.id) })} />
                            {item.name}
                          </label>
                        );
                      })}
                    </div>
                    <small className="field-help">Select every department where this doctor accepts bookings. The first selected department is the Primary department.</small>
                  </fieldset>
                )}
                <label>
                  Qualifications
                  <input value={provider.qualifications ?? ""} onChange={(e) => setProvider({ ...provider, qualifications: e.target.value })} placeholder="MBBS, MD" />
                </label>
                <label>
                  Medical registration number
                  <input value={provider.registration_number ?? ""} onChange={(e) => setProvider({ ...provider, registration_number: e.target.value })} placeholder="Medical council registration" />
                  <small className="field-help">Do not enter a phone number here.</small>
                </label>
                <label>
                  Years of experience
                  <input type="number" min="0" max="80" value={provider.experience_years ?? ""} onChange={(e) => setProvider({ ...provider, experience_years: e.target.value ? Number(e.target.value) : null })} />
                </label>
                <label>
                  {category === "Healthcare" ? "Doctor WhatsApp number" : "Provider WhatsApp number"}
                  <input type="tel" inputMode="tel" value={provider.contact_phone ?? ""} onChange={(e) => setProvider({ ...provider, contact_phone: e.target.value })} placeholder="+919831582626" />
                  <small className="field-help">Used only after the provider’s queue-notification consent is recorded.</small>
                </label>
                <label>
                  Provider email
                  <input type="email" value={provider.contact_email ?? ""} onChange={(e) => setProvider({ ...provider, contact_email: e.target.value })} placeholder="doctor@clinic.com" />
                </label>
                <label className="wide">
                  Languages
                  <input value={(provider.languages || []).join(", ")} onChange={(e) => setProvider({ ...provider, languages: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="English, Bengali, Hindi" />
                </label>
                <label className="wide">
                  Public biography
                  <textarea value={provider.biography ?? ""} onChange={(e) => setProvider({ ...provider, biography: e.target.value })} placeholder="A short patient-friendly introduction." />
                </label>
              </div>
              <section className="public-brochure-control">
                <div>
                  <b>{category === "Healthcare" ? "Doctor directory & brochure" : "Provider directory & brochure"}</b>
                  <span>Patients receive this custom brochure when set. Otherwise OmniRelay creates a current directory PDF from the {category === "Healthcare" ? "doctors" : "providers"} and locations below.</span>
                </div>
                <div className="form-grid">
                  <label className="wide">
                    Custom brochure link (optional)
                    <input type="url" value={customBrochureUrl} onChange={(e) => setCustomBrochureUrl(e.target.value)} placeholder="https://your-clinic.com/doctor-directory.pdf" aria-invalid={brochureUrlError} />
                    <small className="field-help">Use a public HTTPS PDF link. It replaces the generated brochure until removed.</small>
                  </label>
                  <label className="secondary-button brochure-upload">
                    Upload PDF brochure
                    <input type="file" accept="application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadClinicBrochure(file); }} />
                  </label>
                  {customBrochurePath && <span className="brochure-status">Custom PDF ready</span>}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : (
        <p className="provider-note">A bookable provider will appear here after the initial workspace setup.</p>
      )}
    </section>
  );
}
