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

    // 1. Get Provider / Doctor (Column is 'active' in canonical postgres schema)
    let doctorQuery = admin
      .from("booking_resources")
      .select("id, name, active")
      .eq("organization_id", orgId)
      .eq("active", true);

    if (doctorId) {
      doctorQuery = doctorQuery.eq("id", doctorId);
    }

    let { data: doctors, error: docError } = await doctorQuery;

    // Fallback attempt if column was migrated as is_active in legacy instance
    if (docError && docError.message.includes("active")) {
      const fallbackQuery = admin
        .from("booking_resources")
        .select("id, name, is_active")
        .eq("organization_id", orgId)
        .eq("is_active", true);
      const fbResult = await (doctorId ? fallbackQuery.eq("id", doctorId) : fallbackQuery);
      doctors = fbResult.data;
      docError = fbResult.error;
    }

    if (docError) {
      return NextResponse.json({ error: docError.message }, { status: 500 });
    }

    if (!doctors || doctors.length === 0) {
      return NextResponse.json({
        available: false,
        slots: [],
        speech_summary: "No doctors are currently available on this date. Would you like to check another day?",
      });
    }

    const activeDoctor = doctors[0];

    // 2. Fetch booked appointments for this doctor on this date (fail-closed on error - F-06)
    let bookedQuery = admin
      .from("voice_appointments_readonly")
      .select("starts_at, ends_at, doctor_id")
      .eq("organization_id", orgId)
      .eq("appointment_date", dateQuery);

    if (activeDoctor.id && activeDoctor.id !== "default") {
      bookedQuery = bookedQuery.eq("doctor_id", activeDoctor.id);
    }

    const { data: booked, error: apptError } = await bookedQuery;

    if (apptError) {
      console.error("[Voice Availability] View query failure, refusing to invent fake slots:", apptError.message);
      return NextResponse.json(
        { error: "APPOINTMENT_DATA_UNAVAILABLE", message: "Unable to retrieve calendar availability securely." },
        { status: 500 }
      );
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
