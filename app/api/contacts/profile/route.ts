import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

type Payload = {
  patientId?: string; contactAddress?: string; fullName?: string; email?: string;
  age?: number | null; healthConcern?: string; locality?: string; pincode?: string;
  patientSummary?: string; careConsent?: boolean; marketingConsent?: boolean;
};

const clean = (value: unknown) => typeof value === "string" ? value.trim() || null : null;
const phoneDigits = (value: string) => value.replace(/\D/g, "");

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const payload = await request.json().catch(() => ({})) as Payload;
  const fullName = clean(payload.fullName);
  const contactAddress = clean(payload.contactAddress);
  const pincode = clean(payload.pincode);
  const age = payload.age == null ? null : Number(payload.age);
  if (!fullName) return NextResponse.json({ error: "Patient name is required." }, { status: 400 });
  if (age != null && (!Number.isInteger(age) || age < 0 || age > 120)) return NextResponse.json({ error: "Enter a valid age." }, { status: 400 });
  if (pincode && !/^\d{6}$/.test(pincode)) return NextResponse.json({ error: "Enter a valid 6-digit PIN code." }, { status: 400 });

  let patientId = clean(payload.patientId);
  if (!patientId && contactAddress) {
    const { data: existingPatient } = await supabase.from("patient_profiles")
      .select("id").eq("organization_id", organization.id)
      .eq("normalized_phone", phoneDigits(contactAddress)).maybeSingle();
    patientId = existingPatient?.id ?? null;
  }
  const values = {
    organization_id: organization.id, full_name: fullName, phone: contactAddress,
    email: clean(payload.email), age, health_concern: clean(payload.healthConcern),
    locality: clean(payload.locality), pincode, patient_summary: clean(payload.patientSummary),
    source: contactAddress ? "whatsapp" : "manual", updated_at: new Date().toISOString(),
  };
  const query = patientId
    ? supabase.from("patient_profiles").update(values).eq("id", patientId).eq("organization_id", organization.id)
    : supabase.from("patient_profiles").insert(values);
  const { data: savedPatient, error: patientError } = await query.select("id").single();
  if (patientError || !savedPatient) return NextResponse.json({ error: patientError?.message ?? "Profile could not be saved." }, { status: 400 });

  const { error: consentError } = await supabase.rpc("set_patient_consents", {
    p_patient_id: savedPatient.id,
    p_care_communications: payload.careConsent !== false,
    p_marketing: payload.marketingConsent === true,
    p_source: "staff_patient_profile",
    p_note: "Consent preferences updated from the clinic patient profile.",
  });
  if (consentError) return NextResponse.json({ error: consentError.message }, { status: 400 });

  const { data: patient, error: refreshedPatientError } = await supabase.from("patient_profiles")
    .select("id,full_name,phone,email,age,health_concern,locality,pincode,patient_summary,care_communications_consent,marketing_consent,first_seen_at,last_seen_at,avatar_storage_path,avatar_updated_at")
    .eq("id", savedPatient.id).eq("organization_id", organization.id).single();
  if (refreshedPatientError || !patient) return NextResponse.json({ error: refreshedPatientError?.message ?? "Profile could not be reloaded." }, { status: 400 });

  let contact = null;
  let address = null;
  if (contactAddress) {
    const { data: existingAddress } = await supabase.from("contacts_addresses")
      .select("address,contact_id,extra,status").eq("organization_id", organization.id)
      .eq("service", "whatsapp").eq("address", contactAddress).maybeSingle();
    const extra = {
      patient_id: patient.id, email: patient.email, age: patient.age, locality: patient.locality,
      pincode: patient.pincode, health_concern: patient.health_concern,
      care_communications_consent: patient.care_communications_consent,
      marketing_consent: patient.marketing_consent,
    };
    let contactId = existingAddress?.contact_id ?? null;
    const contactResult = contactId
      ? await supabase.from("contacts").update({ name: patient.full_name, status: "active", extra })
          .eq("id", contactId).eq("organization_id", organization.id).select("id,name,status,extra").single()
      : await supabase.from("contacts").insert({ organization_id: organization.id, name: patient.full_name, status: "active", extra })
          .select("id,name,status,extra").single();
    if (contactResult.error || !contactResult.data) return NextResponse.json({ error: contactResult.error?.message ?? "Contact could not be saved." }, { status: 400 });
    contact = contactResult.data;
    contactId = contact.id;
    const addressResult = existingAddress
      ? await supabase.from("contacts_addresses").update({ contact_id: contactId, status: "active" })
          .eq("organization_id", organization.id).eq("service", "whatsapp").eq("address", contactAddress).select("address,contact_id,extra,status").single()
      : await supabase.from("contacts_addresses").insert({ organization_id: organization.id, service: "whatsapp", address: contactAddress, contact_id: contactId, status: "active", extra: { source: "manual" } })
          .select("address,contact_id,extra,status").single();
    if (addressResult.error) return NextResponse.json({ error: addressResult.error.message }, { status: 400 });
    address = addressResult.data;
  }
  return NextResponse.json({ patient, contact, address });
}
