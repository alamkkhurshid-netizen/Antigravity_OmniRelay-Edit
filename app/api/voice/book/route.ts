import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      org_id,
      caller_phone,
      patient_name,
      doctor_id,
      starts_at,
      ends_at,
      notes,
      service_id,
      location_id,
      call_sid,
    } = body;

    if (!org_id || !caller_phone || !patient_name || !starts_at) {
      return NextResponse.json(
        { error: "Missing required fields: org_id, caller_phone, patient_name, starts_at" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Resolve Doctor / Resource
    let resourceId = doctor_id;
    let doctorName = "Physician";

    if (!resourceId) {
      const { data: firstDoc } = await admin
        .from("booking_resources")
        .select("id, name")
        .eq("organization_id", org_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (firstDoc) {
        resourceId = firstDoc.id;
        doctorName = firstDoc.name;
      }
    } else {
      const { data: doc } = await admin
        .from("booking_resources")
        .select("id, name")
        .eq("id", resourceId)
        .maybeSingle();
      if (doc) doctorName = doc.name;
    }

    // 2. Resolve Service & Location defaults if not provided
    let locId = location_id;
    if (!locId) {
      const { data: firstLoc } = await admin
        .from("business_locations")
        .select("id")
        .eq("organization_id", org_id)
        .limit(1)
        .maybeSingle();
      if (firstLoc) locId = firstLoc.id;
    }

    let srvId = service_id;
    if (!srvId) {
      const { data: firstSrv } = await admin
        .from("organization_services")
        .select("id")
        .eq("organization_id", org_id)
        .limit(1)
        .maybeSingle();
      if (firstSrv) srvId = firstSrv.id;
    }

    // 3. Compute ends_at (default +30 mins)
    const startDate = new Date(starts_at);
    const endDate = ends_at ? new Date(ends_at) : new Date(startDate.getTime() + 30 * 60 * 1000);

    // 4. Check for overlapping appointment
    if (resourceId) {
      const { data: conflict } = await admin
        .from("appointments")
        .select("id")
        .eq("organization_id", org_id)
        .eq("resource_id", resourceId)
        .in("status", ["confirmed", "pending", "arrived"])
        .lt("starts_at", endDate.toISOString())
        .gt("ends_at", startDate.toISOString())
        .maybeSingle();

      if (conflict) {
        return NextResponse.json(
          { error: "Slot conflict: The requested time window is already booked with this doctor." },
          { status: 409 }
        );
      }
    }

    // 5. Find or create patient profile
    let patientId: string | null = null;
    const { data: existingPatient } = await admin
      .from("patient_profiles")
      .select("id")
      .eq("organization_id", org_id)
      .eq("phone", caller_phone)
      .maybeSingle();

    if (existingPatient) {
      patientId = existingPatient.id;
    } else {
      const { data: newPatient } = await admin
        .from("patient_profiles")
        .insert({
          organization_id: org_id,
          full_name: patient_name,
          phone: caller_phone,
        })
        .select("id")
        .maybeSingle();

      if (newPatient) patientId = newPatient.id;
    }

    // 6. Insert Appointment with "Voice" Source Tag
    const appointmentPayload: Record<string, unknown> = {
      organization_id: org_id,
      patient_id: patientId,
      resource_id: resourceId || null,
      location_id: locId || null,
      service_id: srvId || null,
      customer_name: patient_name,
      customer_phone: caller_phone,
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      status: "confirmed",
      source: "Voice",
      notes: notes || "Booked via Voice AI Assistant",
      payment_status: "pending",
    };

    const { data: appointment, error: apptErr } = await admin
      .from("appointments")
      .insert(appointmentPayload)
      .select()
      .single();

    if (apptErr) {
      return NextResponse.json({ error: apptErr.message }, { status: 500 });
    }

    // 7. Update voice_call_logs if call_sid provided
    if (call_sid) {
      await admin
        .from("voice_call_logs")
        .update({
          outcome: "appointment_booked",
          summary: `Appointment booked for ${patient_name} with Dr. ${doctorName} at ${startDate.toLocaleTimeString("en-IN")}.`,
          updated_at: new Date().toISOString(),
        })
        .eq("exotel_call_sid", call_sid);
    }

    // 8. Generate spoken confirmation response
    const readableDate = startDate.toLocaleDateString("en-IN", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const readableTime = startDate.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const confirmationSpeech = `Thank you ${patient_name}! Your appointment with Dr. ${doctorName} is confirmed for ${readableDate} at ${readableTime}. We have sent confirmation details to your phone.`;

    return NextResponse.json({
      success: true,
      appointment,
      confirmation_speech: confirmationSpeech,
      doctor_name: doctorName,
      date: readableDate,
      time: readableTime,
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
