import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyVoiceServiceAuth } from "@/lib/voice/auth";
import {
  generateDaySlots,
  filterAvailableSlots,
  buildVoiceAvailabilitySpeech,
} from "@/lib/voice/availability";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");
    const doctorId = searchParams.get("doctor_id");
    const dateQuery = searchParams.get("date") || new Date().toISOString().split("T")[0];

    if (!orgId) {
      return NextResponse.json({ error: "Missing required parameter: org_id" }, { status: 400 });
    }

    // Strict Service-to-Service HMAC, Replay Prevention, and Tenant Boundary Authentication
    const authResult = await verifyVoiceServiceAuth(req, "", orgId);
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const admin = createAdminClient();

    // 1. Get Provider / Doctor
    let doctorQuery = admin
      .from("booking_resources")
      .select("id, name, is_active")
      .eq("organization_id", orgId)
      .eq("is_active", true);

    if (doctorId) {
      doctorQuery = doctorQuery.eq("id", doctorId);
    }

    const { data: doctors, error: docError } = await doctorQuery;

    if (docError) {
      return NextResponse.json({ error: docError.message }, { status: 500 });
    }

    const activeDoctor = doctors && doctors.length > 0 ? doctors[0] : { id: "default", name: "On-Duty Physician" };

    // 2. Fetch booked appointments for this date
    const { data: booked, error: apptError } = await admin
      .from("voice_appointments_readonly")
      .select("starts_at, ends_at, doctor_id")
      .eq("organization_id", orgId)
      .eq("appointment_date", dateQuery);

    if (apptError) {
      console.warn("[Voice Availability] View query error, falling back:", apptError.message);
    }

    // 3. Compute slots
    const daySlots = generateDaySlots(dateQuery, 10, 19, 30);
    const slots = filterAvailableSlots(
      daySlots,
      booked || [],
      activeDoctor.id,
      activeDoctor.name
    );

    const speechSummary = buildVoiceAvailabilitySpeech(activeDoctor.name, dateQuery, slots);

    return NextResponse.json({
      organization_id: orgId,
      date: dateQuery,
      doctor: activeDoctor,
      slots,
      available_count: slots.filter((s) => s.available).length,
      speech_summary: speechSummary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
