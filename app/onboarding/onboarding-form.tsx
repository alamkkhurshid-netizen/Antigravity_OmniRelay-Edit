"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Building2, CheckCircle2, Lock, MapPin, ShieldAlert, Sparkles, Stethoscope } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const categories = [
  ["Healthcare", "Doctors, clinics, polyclinics, diagnostics", true],
  ["Restaurants & hospitality", "Restaurants, cafés, hotels", false],
  ["Coaching & education", "Coaching, tuition, training", false],
  ["Beauty & wellness", "Salons, spas, fitness", false],
  ["Professional services", "Consulting, legal, finance", false],
  ["Real estate", "Brokers, builders, property teams", false],
  ["Automotive services", "Garages, dealers, service centres", false],
  ["Retail & e-commerce", "Stores, D2C and online retail", true],
  ["Home services", "Repairs, cleaning, field services", false],
  ["Other", "Custom business model", false],
] as const;

export function OnboardingForm() {
  const [step, setStep] = useState(1);
  const [tier, setTier] = useState<"standard" | "premium">("standard");

  const [category, setCategory] = useState("Healthcare");
  const [name, setName] = useState("");
  const [locations, setLocations] = useState("1");
  const [clinicMode, setClinicMode] = useState("solo_practitioner");
  const [primaryDoctorName, setPrimaryDoctorName] = useState("");
  
  // Double-confirmation gate states
  const [confirmHealthcare, setConfirmHealthcare] = useState(false);
  const [confirmSingleProfile, setConfirmSingleProfile] = useState(false);

  const [waitlistNotice, setWaitlistNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function handleCategoryClick(catName: string, isAvailable: boolean) {
    if (!isAvailable) {
      setWaitlistNotice(`"${catName}" is currently in private waitlist.`);
      return;
    }
    setWaitlistNotice("");
    setCategory(catName);
  }

  function handleNext(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (category === "Healthcare") {
      if (!confirmHealthcare || !confirmSingleProfile) {
        setError("Please confirm both required safeguards below to verify your clinic practice.");
        return;
      }

      if (primaryDoctorName.trim().length < 2) {
        setError("Enter the first doctor’s full name. Patients will see this name when they book.");
        return;
      }
    }

    setStep(2);
  }

  async function finalizeOnboarding(selectedTier: "standard" | "premium") {
    setTier(selectedTier);
    setBusy(true);
    setError("");

    const supabase = createClient();
    const locationCount = locations === "5+" ? 5 : Number(locations);
    const { error: insertError } = await supabase.rpc("complete_workspace_onboarding", {
      p_business_name: name.trim(),
      p_business_category: category,
      p_location_count: locationCount,
      p_timezone: "Asia/Kolkata",
      p_clinic_mode: category === "Healthcare" ? clinicMode : null,
      p_primary_provider_name: category === "Healthcare" ? primaryDoctorName.trim() : null,
      p_subscription_tier: selectedTier,
    });

    if (insertError) {
      setError(insertError.message);
      setBusy(false);
      setStep(1); // Go back if it fails
      return;
    }

    window.location.assign("/app");
  }

  const isFormReady = Boolean(
    name.trim().length >= 2 &&
    (category !== "Healthcare" || (primaryDoctorName.trim().length >= 2 && confirmHealthcare && confirmSingleProfile))
  );

  async function startSandbox(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInAnonymously();
    if (authError) {
      setError("Failed to initialize sandbox session.");
      setBusy(false);
      return;
    }

    const res = await fetch("/api/sandbox/provision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category })
    });

    if (!res.ok) {
      setError("Failed to provision sandbox data.");
      setBusy(false);
      return;
    }

    window.location.assign("/app/action-centre");
  }

  if (step === 2) {
    return (
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10 relative overflow-hidden">
        {/* Subtle top accent */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#087fb9] to-[#18bfc5]" />
        
        <div className="flex items-center justify-between mb-8">
          <span className="text-[10px] font-bold tracking-widest text-[#087fb9] uppercase">CHOOSE ENGINE</span>
          <button onClick={() => setStep(1)} className="text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors">
            ← BACK TO SETUP
          </button>
        </div>
        
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
          Select your automation tier
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          How do you want to handle incoming messages and routing? You can upgrade later.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {/* Standard Tier */}
          <button
            type="button"
            onClick={() => finalizeOnboarding("standard")}
            disabled={busy}
            className="group flex flex-col text-left rounded-2xl border-2 border-slate-200 bg-white p-6 transition-all hover:border-slate-300 hover:shadow-md disabled:opacity-50"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center size-10 rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-slate-200 group-hover:text-slate-800">
                <CheckCircle2 className="size-5" />
              </div>
              <h3 className="font-semibold text-slate-900 text-xl">Standard</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6 h-10 leading-relaxed">Regular WhatsApp Flow and rule-based manual routing.</p>
            <ul className="text-xs text-slate-600 space-y-3 mb-8 flex-1">
              <li className="flex items-start gap-2"><CheckCircle2 className="size-4 text-slate-400 shrink-0 group-hover:text-emerald-500 transition-colors" /> Unified Action Centre</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="size-4 text-slate-400 shrink-0 group-hover:text-emerald-500 transition-colors" /> Standard Broadcasts</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="size-4 text-slate-400 shrink-0 group-hover:text-emerald-500 transition-colors" /> Manual Escalation</li>
            </ul>
            <div className="mt-auto pt-4 border-t border-slate-100 w-full font-semibold text-center text-slate-500 group-hover:text-slate-800 transition-colors">
              {busy && tier === "standard" ? "Provisioning..." : "Select Standard"}
            </div>
          </button>

          {/* Premium Tier */}
          <button
            type="button"
            onClick={() => finalizeOnboarding("premium")}
            disabled={busy}
            className="group flex flex-col text-left rounded-2xl border-2 border-[#18bfc5]/30 bg-gradient-to-b from-[#18bfc5]/5 to-white p-6 transition-all hover:border-[#18bfc5] hover:shadow-[0_8px_30px_rgba(24,191,197,.15)] relative disabled:opacity-50"
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#087fb9] to-[#18bfc5] text-white text-[10px] font-bold tracking-widest uppercase px-4 py-1 rounded-full shadow-sm">
              Recommended
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-[#087fb9] to-[#18bfc5] text-white shadow-md">
                <Sparkles className="size-5" />
              </div>
              <h3 className="font-semibold text-slate-900 text-xl group-hover:text-[#087fb9] transition-colors">Premium AI</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6 h-10 leading-relaxed">RAG AI Concierge & XYFlow Visual Builder.</p>
            <ul className="text-xs text-slate-700 space-y-3 mb-8 flex-1">
              <li className="flex items-start gap-2"><CheckCircle2 className="size-4 text-[#18bfc5] shrink-0" /> Semantic RAG Bot</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="size-4 text-[#18bfc5] shrink-0" /> Upload Custom Documents</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="size-4 text-[#18bfc5] shrink-0" /> XYFlow Drag & Drop Builder</li>
            </ul>
            <div className="mt-auto pt-4 border-t border-[#18bfc5]/20 w-full font-semibold text-center text-[#087fb9]">
              {busy && tier === "premium" ? "Provisioning..." : "Select Premium"}
            </div>
          </button>
        </div>

        {error && (
          <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800 border border-red-100" role="status">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10 relative overflow-hidden" onSubmit={handleNext}>
      {/* Subtle top accent */}
      <div className="absolute top-0 inset-x-0 h-1 bg-[#18bfc5]" />
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <span className="text-[10px] font-bold tracking-widest text-[#087fb9] uppercase">WORKSPACE FOUNDATION</span>
        {category === "Healthcare" && (
        <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold tracking-wider text-emerald-700 border border-emerald-200 shadow-sm">
          <Stethoscope className="size-3.5" /> CLINIC & HEALTHCARE ONLY
        </span>
        )}
        {category === "Retail & e-commerce" && (
        <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-[10px] font-bold tracking-wider text-indigo-700 border border-indigo-200 shadow-sm">
          <Sparkles className="size-3.5" /> RETAIL MODULE UNLOCKED
        </span>
        )}
      </div>
      
      <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
        {category === "Healthcare" ? "Register your clinic practice" : "Set up your retail business"}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-slate-500">
        {category === "Healthcare" 
          ? "This CRM is purpose-built for medical clinics, doctor OPDs, and healthcare practices. Your account will be permanently configured for clinical operations."
          : "Your account will be configured with retail-focused automation, inventory tracking, and meta commerce integrations."}
      </p>

      {/* Business Name */}
      <label className="mt-8 grid gap-2 text-sm font-semibold text-slate-700">
        {category === "Healthcare" ? "Clinic or hospital name" : "Store or business name"}
        <span className="relative mt-1">
          <Building2 className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <input
            className="min-h-[52px] w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-[#18bfc5] focus:ring-4 focus:ring-[#18bfc5]/10 text-slate-900 placeholder:text-slate-400"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dr. Sen Polyclinic & Diagnostics"
            required
          />
        </span>
      </label>

      {/* Business Category Selection with Healthcare Lock */}
      <fieldset className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <legend className="text-sm font-semibold text-slate-700">Operating vertical</legend>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#087fb9]">Active Module</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {categories.map(([catName, desc, isAvailable]) => (
            <button
              type="button"
              className={`group rounded-xl border p-4 text-left transition-all relative overflow-hidden ${
                category === catName
                  ? "border-[#18bfc5] bg-[#18bfc5]/5 shadow-[inset_4px_0_0_0_#18bfc5]"
                  : "border-slate-200 bg-white hover:border-[#18bfc5]/50 hover:bg-slate-50"
              }`}
              onClick={() => handleCategoryClick(catName, isAvailable)}
              key={catName}
            >
              <div className="flex items-center justify-between mb-1">
                <b className={`block text-sm font-semibold transition-colors ${category === catName ? "text-[#087fb9]" : "text-slate-700 group-hover:text-slate-900"}`}>{catName}</b>
                {!isAvailable && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded shadow-sm">
                    Waitlist
                  </span>
                )}
                {isAvailable && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded shadow-sm">
                    Active
                  </span>
                )}
              </div>
              <span className={`block text-xs leading-relaxed transition-colors ${category === catName ? "text-[#087fb9]/80" : "text-slate-500"}`}>{desc}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {waitlistNotice && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-3 shadow-sm">
          <ShieldAlert className="size-5 shrink-0 text-amber-600" />
          <span className="leading-relaxed font-medium">{waitlistNotice}</span>
        </div>
      )}

      {/* Chambers & Locations */}
      <label className="mt-8 grid gap-2 text-sm font-semibold text-slate-700">
        {category === "Healthcare" ? "Consultation chambers or locations" : "Retail stores or warehouses"}
        <span className="relative mt-1">
          <MapPin className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <select
            className="min-h-[52px] w-full appearance-none rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-[#18bfc5] focus:ring-4 focus:ring-[#18bfc5]/10 text-slate-900"
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            required
          >
            {["1", "2", "3", "4", "5+"].map((x) => (
              <option key={x} value={x}>
                {x} {x === "1" ? "Chamber" : "Chambers"}
              </option>
            ))}
          </select>
          {/* Custom dropdown arrow */}
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
        </span>
      </label>

      {/* Doctor Setup */}
      {category === "Healthcare" && (
      <fieldset className="mt-8 grid gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
        <legend className="px-2 text-sm font-bold tracking-wider text-[#087fb9] uppercase flex items-center gap-2 -ml-2">
          <Sparkles className="size-4 text-[#18bfc5]" /> Doctor & OPD Setup
        </legend>
        <div className="grid gap-5 sm:grid-cols-2 mt-2">
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Clinic operating model
            <select
              className="min-h-[48px] rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition-all focus:border-[#18bfc5] focus:ring-4 focus:ring-[#18bfc5]/10 text-slate-900"
              value={clinicMode}
              onChange={(e) => setClinicMode(e.target.value)}
            >
              <option value="solo_practitioner">Single-doctor clinic</option>
              <option value="multi_doctor_clinic">Multi-doctor clinic / polyclinic</option>
              <option value="diagnostic_centre">Diagnostic centre</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            {clinicMode === "multi_doctor_clinic" ? "Lead physician / First doctor" : "Doctor’s full name"}
            <input
              className="min-h-[48px] rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition-all focus:border-[#18bfc5] focus:ring-4 focus:ring-[#18bfc5]/10 text-slate-900 placeholder:text-slate-400"
              value={primaryDoctorName}
              onChange={(e) => setPrimaryDoctorName(e.target.value)}
              placeholder="e.g. Dr. Khurshid Alam"
              required={category === "Healthcare"}
            />
          </label>
        </div>
        <p className="text-xs leading-relaxed text-slate-500 border-t border-slate-200 pt-4 mt-2">
          This is the patient-facing medical booking identity. You can add additional doctors, visiting consultants, and OPD timings once inside.
        </p>
      </fieldset>
      )}

      {category === "Retail & e-commerce" && (
      <fieldset className="mt-8 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
        <legend className="px-2 text-sm font-bold tracking-wider text-[#087fb9] uppercase flex items-center gap-2 -ml-2">
          <Sparkles className="size-4 text-[#18bfc5]" /> Retail & E-commerce Setup
        </legend>
        <p className="text-xs leading-relaxed text-slate-500 mt-2">
          This is the customer-facing business identity. You can configure your Meta Commerce Catalog and product tiers directly in the dashboard after completing onboarding.
        </p>
      </fieldset>
      )}

      {/* MANDATORY DOUBLE-CONFIRMATION GATE */}
      {category === "Healthcare" && (
      <div className="mt-8 rounded-2xl border border-[#18bfc5]/30 bg-[#18bfc5]/5 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-[#087fb9] uppercase">
          <Lock className="size-4 text-[#18bfc5]" />
          <span>DOUBLE-CONFIRMATION & PERMANENT PROFILE LOCK</span>
        </div>
        <p className="mt-3 text-xs text-slate-600 leading-relaxed font-medium">
          To maintain medical record integrity and regulatory compliance, every account on this platform is strictly bound to a single clinical organization.
        </p>

        <div className="mt-5 space-y-4">
          <label className="flex items-start gap-4 cursor-pointer select-none group">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                className="peer size-5 cursor-pointer appearance-none rounded border-2 border-slate-300 bg-white transition-all checked:border-[#18bfc5] checked:bg-[#18bfc5]"
                checked={confirmHealthcare}
                onChange={(e) => setConfirmHealthcare(e.target.checked)}
              />
              <CheckCircle2 className="pointer-events-none absolute size-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={4} />
            </div>
            <span className="text-sm font-medium text-slate-700 leading-relaxed group-hover:text-slate-900 transition-colors">
              I confirm this workspace is exclusively for a licensed clinic, hospital, doctor practice, or diagnostic centre.
            </span>
          </label>

          <label className="flex items-start gap-4 cursor-pointer select-none group">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                className="peer size-5 cursor-pointer appearance-none rounded border-2 border-slate-300 bg-white transition-all checked:border-[#18bfc5] checked:bg-[#18bfc5]"
                checked={confirmSingleProfile}
                onChange={(e) => setConfirmSingleProfile(e.target.checked)}
              />
              <CheckCircle2 className="pointer-events-none absolute size-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={4} />
            </div>
            <span className="text-sm font-medium text-slate-700 leading-relaxed group-hover:text-slate-900 transition-colors">
              I understand that my login email is permanently locked to this single clinic profile and cannot create or switch to other business profiles.
            </span>
          </label>
        </div>
      </div>
      )}

      <div className="mt-10 flex flex-col gap-4 sm:flex-row border-t border-slate-100 pt-8">
        <button
          type="submit"
          className={`inline-flex min-h-[52px] flex-1 items-center justify-center gap-3 rounded-xl px-6 text-sm font-semibold text-white transition-all shadow-[0_4px_14px_rgba(8,127,185,0.2)] ${
            isFormReady && !busy
              ? "bg-gradient-to-r from-[#087fb9] to-[#18bfc5] hover:opacity-90 hover:shadow-[0_6px_20px_rgba(8,127,185,0.3)] hover:-translate-y-0.5 cursor-pointer"
              : "bg-slate-300 cursor-not-allowed opacity-70 shadow-none"
          }`}
          disabled={!isFormReady || busy}
        >
          {category === "Healthcare" ? "Next: Choose Plan" : "Next: Choose Plan"} <ArrowRight className="size-4" />
        </button>

        <button
          type="button"
          onClick={startSandbox}
          className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy}
        >
          <Sparkles className="size-4 text-[#18bfc5]" />
          Experience the Sandbox (Demo)
        </button>
      </div>

      {error && (
        <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800 border border-red-100" role="status">
          {error}
        </p>
      )}
    </form>
  );
}
