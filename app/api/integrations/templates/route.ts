import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

export const STANDARD_TEMPLATES = [
  {
    event_type: "confirmation",
    provider_template_name: "omnirelay_booking_confirmation",
    language_code: "en",
    group_key: "confirmation",
    category: "UTILITY",
    variable_map: { "1": "patient_name", "2": "business_name", "3": "appointment_time", "4": "location_name", "5": "manage_url" },
    body_text: "Hello {{1}}, your appointment with {{2}} is confirmed for {{3}} at {{4}}. Manage or reschedule your appointment here: {{5}}",
    sample_values: ["Rahul Sharma", "Dr Alam's Clinic", "Tuesday 18 Nov at 4:00 PM", "Chamber 1", "https://omnirelay.in/m/abc123"]
  },
  {
    event_type: "reminder_24h",
    provider_template_name: "omnirelay_appointment_reminder",
    language_code: "en",
    group_key: "appointment-reminder",
    category: "UTILITY",
    variable_map: { "1": "patient_name", "2": "business_name", "3": "appointment_time", "4": "location_name", "5": "manage_url" },
    body_text: "Reminder: Hello {{1}}, your appointment with {{2}} is scheduled for {{3}} at {{4}}. If you need to make changes, visit: {{5}}",
    sample_values: ["Rahul Sharma", "Dr Alam's Clinic", "Tomorrow at 4:00 PM", "Chamber 1", "https://omnirelay.in/m/abc123"]
  },
  {
    event_type: "reminder_2h",
    provider_template_name: "omnirelay_appointment_reminder",
    language_code: "en",
    group_key: "appointment-reminder",
    category: "UTILITY",
    variable_map: { "1": "patient_name", "2": "business_name", "3": "appointment_time", "4": "location_name", "5": "manage_url" },
    body_text: "Reminder: Hello {{1}}, your appointment with {{2}} is scheduled for {{3}} at {{4}}. If you need to make changes, visit: {{5}}",
    sample_values: ["Rahul Sharma", "Dr Alam's Clinic", "Today at 4:00 PM", "Chamber 1", "https://omnirelay.in/m/abc123"]
  },
  {
    event_type: "cancellation",
    provider_template_name: "omnirelay_booking_change",
    language_code: "en",
    group_key: "booking-change",
    category: "UTILITY",
    variable_map: { "1": "patient_name", "2": "business_name", "3": "appointment_time", "4": "action_summary", "5": "manage_url" },
    body_text: "Hello {{1}}, regarding your appointment with {{2}} on {{3}}: {{4}}. To book a new time or view details: {{5}}",
    sample_values: ["Rahul Sharma", "Dr Alam's Clinic", "Tuesday 18 Nov at 4:00 PM", "Your appointment has been cancelled", "https://omnirelay.in/m/abc123"]
  },
  {
    event_type: "reschedule",
    provider_template_name: "omnirelay_booking_change",
    language_code: "en",
    group_key: "booking-change",
    category: "UTILITY",
    variable_map: { "1": "patient_name", "2": "business_name", "3": "appointment_time", "4": "action_summary", "5": "manage_url" },
    body_text: "Hello {{1}}, regarding your appointment with {{2}} on {{3}}: {{4}}. To book a new time or view details: {{5}}",
    sample_values: ["Rahul Sharma", "Dr Alam's Clinic", "Wednesday 19 Nov at 5:00 PM", "Your appointment has been rescheduled", "https://omnirelay.in/m/abc123"]
  },
  {
    event_type: "follow_up",
    provider_template_name: "omnirelay_follow_up",
    language_code: "en",
    group_key: "follow-up",
    category: "UTILITY",
    variable_map: { "1": "patient_name", "2": "business_name", "3": "doctor_name", "4": "booking_url" },
    body_text: "Hello {{1}}, this is a follow-up check from {{2}} regarding your care with Dr. {{3}}. To schedule your follow-up consultation, please visit: {{4}}",
    sample_values: ["Rahul Sharma", "Dr Alam's Clinic", "Dr Alok Ray", "https://omnirelay.in/book"]
  },
  {
    event_type: "doctor_queue",
    provider_template_name: "omnirelay_doctor_queue",
    language_code: "en",
    group_key: "doctor-queue",
    category: "UTILITY",
    variable_map: { "1": "doctor_name", "2": "clinic_name", "3": "shift_and_chamber", "4": "booking_count" },
    body_text: "Good day Dr. {{1}}, your upcoming shift at {{2}} ({{3}}) currently has {{4}} scheduled patient bookings.",
    sample_values: ["Dr Alok Ray", "Dr Alam's Clinic", "Tuesday 15:00-19:00 (Chamber 5)", "8"]
  }
];

export async function GET() {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !organization) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [{ data: templates }, { data: settings }] = await Promise.all([
      supabase.from("channel_message_templates").select("*").eq("organization_id", organization.id).eq("channel", "whatsapp"),
      supabase.from("whatsapp_booking_settings").select("*").eq("organization_id", organization.id).maybeSingle(),
    ]);

    return NextResponse.json({
      templates: templates ?? [],
      bookingSettings: settings ?? null,
      specs: STANDARD_TEMPLATES,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !organization) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "activate_all");
    const groupKey = body.group_key ? String(body.group_key) : null;
    const nowIso = new Date().toISOString();

    let targetSpecs = STANDARD_TEMPLATES;
    if (action === "activate_group" && groupKey) {
      targetSpecs = STANDARD_TEMPLATES.filter((s) => s.group_key === groupKey);
    }

    if (action === "activate_all" || action === "activate_group") {
      const rowsToUpsert = targetSpecs.map((item) => ({
        organization_id: organization.id,
        channel: "whatsapp",
        event_type: item.event_type,
        provider_template_name: item.provider_template_name,
        language_code: item.language_code,
        status: "approved",
        variable_map: item.variable_map,
        updated_at: nowIso,
      }));

      const { data: upserted, error: upErr } = await supabase
        .from("channel_message_templates")
        .upsert(rowsToUpsert, { onConflict: "organization_id,channel,event_type,language_code" })
        .select();

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 400 });
      }

      // Also ensure whatsapp_booking_settings exists and is enabled
      const { data: existingSettings } = await supabase
        .from("whatsapp_booking_settings")
        .select("id, enabled")
        .eq("organization_id", organization.id)
        .maybeSingle();

      if (!existingSettings) {
        await supabase.from("whatsapp_booking_settings").insert({
          organization_id: organization.id,
          enabled: true,
          confirmation_mode: "instant",
          allow_secure_history: true,
          welcome_message: "Welcome. I can help you book an appointment, view an existing booking, or speak with our team.",
          session_timeout_minutes: 30,
          waitlist_offer_minutes: 30,
          patient_portal_base_url: "https://omnirelay.in",
        });
      } else if (!existingSettings.enabled) {
        await supabase
          .from("whatsapp_booking_settings")
          .update({ enabled: true, updated_at: nowIso })
          .eq("organization_id", organization.id);
      }

      return NextResponse.json({
        success: true,
        action,
        count: upserted?.length ?? rowsToUpsert.length,
        message: `Activated ${rowsToUpsert.length} templates in OmniRelay and enabled WhatsApp Booking Concierge.`,
      });
    }

    if (action === "enable_concierge") {
      const { error: setErr } = await supabase
        .from("whatsapp_booking_settings")
        .upsert(
          {
            organization_id: organization.id,
            enabled: true,
            confirmation_mode: "instant",
            allow_secure_history: true,
            session_timeout_minutes: 30,
            waitlist_offer_minutes: 30,
            patient_portal_base_url: "https://omnirelay.in",
            updated_at: nowIso,
          },
          { onConflict: "organization_id" }
        );

      if (setErr) {
        return NextResponse.json({ error: setErr.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: "WhatsApp Booking Concierge enabled.",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
