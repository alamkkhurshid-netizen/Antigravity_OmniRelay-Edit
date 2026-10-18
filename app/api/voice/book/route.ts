import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyVoiceServiceAuth } from "@/lib/voice/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let body: Record<string, unknown> = {};
    try {
      body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
    }

    const org_id = body.org_id ? String(body.org_id) : undefined;
    const caller_phone = body.caller_phone ? String(body.caller_phone) : undefined;
    const patient_name = body.patient_name ? String(body.patient_name) : undefined;
    const doctor_id = body.doctor_id ? String(body.doctor_id) : undefined;
    const starts_at = body.starts_at ? String(body.starts_at) : undefined;
    const ends_at = body.ends_at ? String(body.ends_at) : undefined;
    const notes = body.notes ? String(body.notes) : undefined;
    const service_id = body.service_id ? String(body.service_id) : undefined;
    const location_id = body.location_id ? String(body.location_id) : undefined;
    const call_sid = body.call_sid ? String(body.call_sid) : undefined;


    // Strict Service-to-Service HMAC, Replay Prevention, and Tenant Boundary Authentication
    const authResult = await verifyVoiceServiceAuth(req, rawBody, org_id);
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!org_id || !caller_phone || !patient_name || !starts_at) {
      return NextResponse.json(
        { error: "Missing required fields: org_id, caller_phone, patient_name, starts_at" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Resolve Doctor / Resource (Strictly Tenant-Bound)
    let resourceId = doctor_id;
    let doctorName = "Physician";

    if (resourceId) {
      const { data: doc } = await admin
        .from("booking_resources")
        .select("id, name")
        .eq("id", resourceId)
        .eq("organization_id", org_id)
        .maybeSingle();

      if (!doc) {
        return NextResponse.json(
          { error: `Doctor/resource not found or does not belong to organization: ${resourceId}` },
          { status: 404 }
        );
      }
      doctorName = doc.name;
    } else {
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
    }

    // 2. Resolve Service & Location defaults (Strictly Tenant-Bound)
    let locId = location_id;
    if (locId) {
      const { data: loc } = await admin
        .from("business_locations")
        .select("id")
        .eq("id", locId)
        .eq("organization_id", org_id)
        .maybeSingle();

      if (!loc) {
        return NextResponse.json(
          { error: `Business location not found or does not belong to organization: ${locId}` },
          { status: 404 }
        );
      }
    } else {
      const { data: firstLoc } = await admin
        .from("business_locations")
        .select("id")
        .eq("organization_id", org_id)
        .limit(1)
        .maybeSingle();
      if (firstLoc) locId = firstLoc.id;
    }

    let srvId = service_id;
    if (srvId) {
      const { data: srv } = await admin
        .from("organization_services")
        .select("id")
        .eq("id", srvId)
        .eq("organization_id", org_id)
        .maybeSingle();

      if (!srv) {
        return NextResponse.json(
          { error: `Organization service not found or does not belong to organization: ${srvId}` },
          { status: 404 }
        );
      }
    } else {
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

    const bookingIntentKey = String(call_sid || authResult.requestId || body.idempotency_key || "");

    // 4. Database-Level Booking Idempotency Check
    if (bookingIntentKey) {
      const { data: existingAppt } = await admin
        .from("appointments")
        .select("*")
        .eq("organization_id", org_id)
        .filter("metadata->>voice_call_sid", "eq", bookingIntentKey)
        .maybeSingle();

      if (existingAppt) {
        return NextResponse.json({
          success: true,
          idempotent: true,
          appointment: existingAppt,
          message: "Appointment already booked for this voice session (idempotent replay)",
        });
      }
    }

    // 5. Check for overlapping appointment slot conflicts
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

    // 6. Find or create patient profile
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

    // 7. Insert Appointment with "Voice" Source Tag and Idempotency Metadata
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
      metadata: {
        voice_call_sid: bookingIntentKey || null,
        voice_request_id: authResult.requestId || null,
        booked_at: new Date().toISOString(),
      },
    };

    let appointment: Record<string, unknown> | null = null;
    const { data: insertedAppt, error: apptErr } = await admin
      .from("appointments")
      .insert(appointmentPayload)
      .select()
      .single();

    if (apptErr) {
      // Concurrency race guard: if duplicate key violated, fetch the winning concurrent appointment
      if (
        apptErr.code === "23505" ||
        apptErr.message?.includes("voice_call_idempotency") ||
        apptErr.message?.includes("unique")
      ) {
        const { data: raceAppt } = await admin
          .from("appointments")
          .select("*")
          .eq("organization_id", org_id)
          .filter("metadata->>voice_call_sid", "eq", bookingIntentKey)
          .maybeSingle();

        if (raceAppt) {
          return NextResponse.json({
            success: true,
            idempotent: true,
            appointment: raceAppt,
            message: "Appointment already booked for this voice session (concurrency resolved)",
          });
        }
      }
      return NextResponse.json({ error: apptErr.message }, { status: 500 });
    }

    appointment = insertedAppt;

    // 8. Update voice_call_logs if call_sid provided
    if (call_sid) {
      await admin
        .from("voice_call_logs")
        .update({
          outcome: "appointment_booked",
          summary: `Appointment booked for ${patient_name} with Dr. ${doctorName} at ${startDate.toLocaleTimeString("en-IN")}.`,
          updated_at: new Date().toISOString(),
        })
        .eq("exotel_call_sid", call_sid)
        .eq("org_id", org_id);
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
