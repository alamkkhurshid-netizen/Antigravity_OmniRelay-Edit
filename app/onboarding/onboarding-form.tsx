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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    if (category === "Healthcare") {
      if (!confirmHealthcare || !confirmSingleProfile) {
        setError("Please confirm both required safeguards below to verify your clinic practice.");
        setBusy(false);
        return;
      }

      if (primaryDoctorName.trim().length < 2) {
        setError("Enter the first doctor’s full name. Patients will see this name when they book.");
        setBusy(false);
        return;
      }
    }

    const supabase = createClient();
    const locationCount = locations === "5+" ? 5 : Number(locations);
    const { error: insertError } = await supabase.rpc("complete_workspace_onboarding", {
      p_business_name: name.trim(),
      p_business_category: category,
      p_location_count: locationCount,
      p_timezone: "Asia/Kolkata",
      p_clinic_mode: category === "Healthcare" ? clinicMode : null,
      p_primary_provider_name: category === "Healthcare" ? primaryDoctorName.trim() : null,
    });

    if (insertError) {
      setError(insertError.message);
      setBusy(false);
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
    
    // 1. Authenticate anonymously (Frictionless entry)
    const { error: authError } = await supabase.auth.signInAnonymously();
    if (authError) {
      setError("Failed to initialize sandbox session.");
      setBusy(false);
      return;
    }

    // 2. Provision sandbox data
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

    // 3. Drop into Action Centre
    window.location.assign("/app/action-centre");
  }

  return (
    <form className="w-full rounded-3xl border border-[#d8e5e9] bg-white p-6 shadow-[0_20px_60px_rgba(7,38,58,.1)] sm:p-8" onSubmit={submit}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-black tracking-[.18em] text-[#1688a6]">WORKSPACE FOUNDATION</span>
        {category === "Healthcare" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
          <Stethoscope className="size-3.5" /> CLINIC & HEALTHCARE ONLY
        </span>
        )}
        {category === "Retail & e-commerce" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 border border-indigo-200">
          <Sparkles className="size-3.5" /> RETAIL MODULE UNLOCKED
        </span>
        )}
      </div>
      
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#173047]">
        {category === "Healthcare" ? "Register your clinic practice" : "Set up your retail business"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#667985]">
        {category === "Healthcare" 
          ? "This CRM is purpose-built for medical clinics, doctor OPDs, and healthcare practices. Your account will be permanently configured for clinical operations."
          : "Your account will be configured with retail-focused automation, inventory tracking, and meta commerce integrations."}
      </p>

      {/* Business Name */}
      <label className="mt-6 grid gap-2 text-sm font-bold text-[#294558]">
        {category === "Healthcare" ? "Clinic or hospital name" : "Store or business name"} <span className="sr-only">required</span>
        <span className="relative">
          <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6e98a9]" />
          <input
            className="min-h-12 w-full rounded-xl border border-[#cadce3] bg-white py-3 pl-10 pr-3 text-sm outline-none ring-[#1d9cc0] focus:ring-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dr. Sen Polyclinic & Diagnostics"
            required
          />
        </span>
      </label>

      {/* Business Category Selection with Healthcare Lock */}
      <fieldset className="mt-6">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-bold text-[#294558]">Operating vertical</legend>
          <span className="text-xs font-semibold text-sky-700">Healthcare Active</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {categories.map(([catName, desc, isAvailable]) => (
            <button
              type="button"
              className={`rounded-xl border p-3 text-left transition-colors relative ${
                category === catName
                  ? "border-[#159ab6] bg-[#eefbfd] shadow-[inset_3px_0_#1ab8a4] ring-1 ring-[#159ab6]"
                  : "border-[#d9e5e8] bg-white opacity-60 hover:opacity-80 hover:border-[#9acedd]"
              }`}
              onClick={() => handleCategoryClick(catName, isAvailable)}
              key={catName}
            >
              <div className="flex items-center justify-between">
                <b className="block text-sm text-[#26455b]">{catName}</b>
                {!isAvailable && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    Waitlist
                  </span>
                )}
                {isAvailable && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                    Active CRM
                  </span>
                )}
              </div>
              <span className="mt-1 block text-xs leading-4 text-[#70818a]">{desc}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {waitlistNotice && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
          <ShieldAlert className="size-4 shrink-0 mt-0.5 text-amber-600" />
          <span>{waitlistNotice}</span>
        </div>
      )}

      {/* Chambers & Locations */}
      <label className="mt-6 grid gap-2 text-sm font-bold text-[#294558]">
        {category === "Healthcare" ? "Consultation chambers or locations" : "Retail stores or warehouses"}
        <span className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6e98a9]" />
          <select
            className="min-h-12 w-full appearance-none rounded-xl border border-[#cadce3] bg-white py-3 pl-10 pr-3 text-sm outline-none ring-[#1d9cc0] focus:ring-2"
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
        </span>
      </label>

      {/* Doctor Setup */}
      {category === "Healthcare" && (
      <fieldset className="mt-6 grid gap-4 rounded-2xl border border-[#cce8e6] bg-[#f7fcfd] p-4">
        <legend className="px-1 text-sm font-bold text-[#294558] flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-[#159ab6]" /> Doctor & OPD Setup
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-[#294558]">
            Clinic operating model
            <select
              className="min-h-12 rounded-xl border border-[#cadce3] bg-white px-3 text-sm outline-none ring-[#1d9cc0] focus:ring-2"
              value={clinicMode}
              onChange={(e) => setClinicMode(e.target.value)}
            >
              <option value="solo_practitioner">Single-doctor clinic</option>
              <option value="multi_doctor_clinic">Multi-doctor clinic / polyclinic</option>
              <option value="diagnostic_centre">Diagnostic centre</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-[#294558]">
            {clinicMode === "multi_doctor_clinic" ? "Lead physician / First doctor" : "Doctor’s full name"}
            <input
              className="min-h-12 rounded-xl border border-[#cadce3] bg-white px-3 text-sm outline-none ring-[#1d9cc0] focus:ring-2"
              value={primaryDoctorName}
              onChange={(e) => setPrimaryDoctorName(e.target.value)}
              placeholder="e.g. Dr. Khurshid Alam"
              required={category === "Healthcare"}
            />
          </label>
        </div>
        <p className="text-xs leading-5 text-[#58717d]">
          This is the patient-facing medical booking identity. You can add additional doctors, visiting consultants, and OPD timings once inside.
        </p>
      </fieldset>
      )}

      {category === "Retail & e-commerce" && (
      <fieldset className="mt-6 grid gap-4 rounded-2xl border border-[#e6e2f8] bg-[#fdfcff] p-4">
        <legend className="px-1 text-sm font-bold text-[#3a2958] flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-[#5f44c4]" /> Retail & E-commerce Setup
        </legend>
        <p className="text-xs leading-5 text-[#58597d]">
          This is the customer-facing business identity. You can configure your Meta Commerce Catalog and product tiers directly in the dashboard after completing onboarding.
        </p>
      </fieldset>
      )}

      {/* MANDATORY DOUBLE-CONFIRMATION GATE */}
      {category === "Healthcare" && (
      <div className="mt-6 rounded-2xl border-2 border-[#1688a6]/40 bg-[#f0f9fb] p-4 sm:p-5">
        <div className="flex items-center gap-2 text-xs font-black tracking-[.14em] text-[#1688a6]">
          <Lock className="size-4 text-[#1688a6]" />
          <span>DOUBLE-CONFIRMATION & PERMANENT PROFILE LOCK</span>
        </div>
        <p className="mt-2 text-xs text-[#406170] leading-relaxed">
          To maintain medical record integrity and regulatory compliance, every account on this platform is strictly bound to a single clinical organization.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border-gray-300 text-[#159ab6] focus:ring-[#159ab6]"
              checked={confirmHealthcare}
              onChange={(e) => setConfirmHealthcare(e.target.checked)}
            />
            <span className="text-xs font-semibold text-[#1f3a4b] leading-5">
              I confirm this workspace is exclusively for a licensed clinic, hospital, doctor practice, or diagnostic centre.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border-gray-300 text-[#159ab6] focus:ring-[#159ab6]"
              checked={confirmSingleProfile}
              onChange={(e) => setConfirmSingleProfile(e.target.checked)}
            />
            <span className="text-xs font-semibold text-[#1f3a4b] leading-5">
              I understand that my login email is permanently locked to this single clinic profile and cannot create or switch to other business profiles.
            </span>
          </label>
        </div>
      </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white shadow-[0_12px_24px_rgba(8,127,163,.22)] transition-all ${
            isFormReady && !busy
              ? "bg-[#087fa3] hover:bg-[#066d8d] cursor-pointer"
              : "bg-gray-400 cursor-not-allowed opacity-60"
          }`}
          disabled={!isFormReady || busy}
        >
          {busy ? (
            "Provisioning…"
          ) : (
            <>
              {category === "Healthcare" ? "Confirm & Enter Clinic CRM" : "Confirm & Enter Retail Platform"} <ArrowRight className="size-4" />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={startSandbox}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-[#1688a6] bg-white px-4 text-sm font-bold text-[#1688a6] transition-all hover:bg-[#f0f9fb] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy}
        >
          <Sparkles className="size-4" />
          Experience the Sandbox (Demo)
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 border border-rose-200" role="status">
          {error}
        </p>
      )}
    </form>
  );
}
