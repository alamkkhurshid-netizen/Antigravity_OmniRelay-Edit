import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { BookingConciergeWorkspace } from "./workspace";

export default async function BookingConciergePage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  const [{ data: settings }, { data: requests }, { data: sessions }, { data: waitlist }, { count: locations }, { count: services }] = await Promise.all([
    supabase.from("whatsapp_booking_settings").select("*").eq("organization_id", organization.id).maybeSingle(),
    supabase.from("whatsapp_booking_requests").select("id,patient_name,patient_phone,starts_at,status,decision_note,created_at,service:organization_services(name),location:business_locations(name),resource:booking_resources(name)").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("whatsapp_booking_sessions").select("id,state,contact_address,context,expires_at,updated_at").eq("organization_id", organization.id).order("updated_at", { ascending: false }).limit(20),
    supabase.from("appointment_waitlist").select("id,patient_name,patient_phone,preferred_date,status,priority,offer_expires_at,created_at,service:organization_services(name),location:business_locations(name),resource:booking_resources(name),offers:waitlist_offers(id,status,starts_at,ends_at,expires_at,created_at)").eq("organization_id", organization.id).order("created_at",{ascending:false}).limit(20),
    supabase.from("business_locations").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("active", true),
    supabase.from("organization_services").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("active", true).eq("booking_enabled", true),
  ]);
  return <BookingConciergeWorkspace organizationId={organization.id} initialSettings={settings} requests={requests ?? []} sessions={sessions ?? []} waitlist={waitlist??[]} locationCount={locations ?? 0} serviceCount={services ?? 0} />;
}
