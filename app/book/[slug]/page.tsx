import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BookingConcierge } from "./booking-concierge";

export const metadata = { title: "Book an appointment" };

type BookingSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PublicBookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: BookingSearchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_booking_page", { p_slug: slug });
  if (error || !data) notFound();
  const handoffToken=value("handoff");
  const handoff=handoffToken?(await createAdminClient().rpc("get_whatsapp_booking_handoff",{p_token:handoffToken})).data:null;
  return <BookingConcierge page={data} initialSelection={{
    serviceId:handoff?.service_id??value("service"),locationId:handoff?.location_id??value("location"),resourceId:handoff?.resource_id??value("provider"),
    date:value("date"),slot:handoff?.starts_at??value("slot"),source:value("source"),handoffToken,
    patientName:handoff?.patient_name??"",bookingContactName:handoff?.booking_contact_name??"",
    bookingContactPhone:handoff?.booking_contact_phone??"",relationship:handoff?.patient_relationship??"self",
  }} />;
}
