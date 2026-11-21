import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

export const STANDARD_TEMPLATES = [
  {
    event_type: "confirmation",
    provider_template_name: "omnirelay_booking_confirmation",
    language_code: "en",
    group_key: "confirmation",
    category: "UTILITY",
    variable_map: {
      "1": "patient_name",
      "2": "doctor_name",
      "3": "clinic_name",
      "4": "service_name",
      "5": "appointment_date",
      "6": "appointment_time",
      "7": "chamber_name",
      "8": "booking_reference"
    },
    body_text: "Hello {{1}}, your appointment with Dr {{2}} is confirmed.\nClinic: {{3}}\nService: {{4}}\nDate: {{5}}\nTime: {{6}}\nChamber: {{7}}\nBooking reference: {{8}}\nThanks for Your booking with us",
    sample_values: ["Rahul Sharma", "Ananya Sen", "Neoclinic", "General Consultation", "18 August 2026", "5:30 PM", "Chamber 1", "OR-28491"]
  },
  {
    event_type: "reminder_24h",
    provider_template_name: "omnirelay_appointment_reminder",
    language_code: "en",
    group_key: "appointment-reminder",
    category: "UTILITY",
    variable_map: {
      "1": "patient_name",
      "2": "doctor_name",
      "3": "appointment_date",
      "4": "appointment_time",
      "5": "chamber_name",
      "6": "booking_reference"
    },
    body_text: "Hello {{1}}, this is a reminder for your appointment with Dr {{2}}.\nDate: {{3}}\nTime: {{4}}\nChamber: {{5}}\nBooking reference: {{6}}\nPlease arrive 15 minutes early.",
    sample_values: ["Rahul Sharma", "Ananya Sen", "18 August 2026", "5:30 PM", "Chamber 1", "OR-28491"]
  },
  {
    event_type: "reminder_2h",
    provider_template_name: "omnirelay_appointment_reminder",
    language_code: "en",
    group_key: "appointment-reminder",
    category: "UTILITY",
    variable_map: {
      "1": "patient_name",
      "2": "doctor_name",
      "3": "appointment_date",
      "4": "appointment_time",
      "5": "chamber_name",
      "6": "booking_reference"
    },
    body_text: "Hello {{1}}, this is a reminder for your appointment with Dr {{2}}.\nDate: {{3}}\nTime: {{4}}\nChamber: {{5}}\nBooking reference: {{6}}\nPlease arrive 15 minutes early.",
    sample_values: ["Rahul Sharma", "Ananya Sen", "18 August 2026", "5:30 PM", "Chamber 1", "OR-28491"]
  },
  {
    event_type: "cancellation",
    provider_template_name: "omnirelay_booking_cancelled",
    language_code: "en",
    group_key: "cancellation",
    category: "UTILITY",
    variable_map: {
      "1": "patient_name",
      "2": "doctor_name",
      "3": "appointment_date",
      "4": "appointment_time",
      "5": "booking_reference"
    },
    body_text: "Hello {{1}}, your appointment with Dr {{2}} scheduled for {{3}} at {{4}} has been cancelled.\nBooking reference: {{5}}\nYou can start a new booking whenever required.",
    sample_values: ["Rahul Sharma", "Ananya Sen", "18 August 2026", "5:30 PM", "OR-28491"]
  },
  {
    event_type: "reschedule",
    provider_template_name: "omnirelay_booking_rescheduled",
    language_code: "en",
    group_key: "reschedule",
    category: "UTILITY",
    variable_map: {
      "1": "patient_name",
      "2": "doctor_name",
      "3": "appointment_date",
      "4": "appointment_time",
      "5": "chamber_name",
      "6": "booking_reference"
    },
    body_text: "Hello {{1}}, your appointment with Dr {{2}} has been rescheduled.\nNew date: {{3}}\nNew time: {{4}}\nChamber: {{5}}\nBooking reference: {{6}}\nPlease reach before 15min before.",
    sample_values: ["Rahul Sharma", "Ananya Sen", "19 August 2026", "6:00 PM", "Chamber 1", "OR-28491"]
  },
  {
    event_type: "follow_up",
    provider_template_name: "omnirelay_follow_up",
    language_code: "en",
    group_key: "follow-up",
    category: "UTILITY",
    variable_map: {
      "1": "patient_name",
      "2": "doctor_name",
      "3": "visit_date",
      "4": "follow_up_due"
    },
    body_text: "Hello {{1}}, Dr {{2}} has scheduled a follow-up for your recent visit on {{3}}.\nFollow-up due: {{4}}\nPlease reply to contact the clinic or arrange an appointment.",
    sample_values: ["Rahul Sharma", "Ananya Sen", "18 August 2026", "25 August 2026"]
  },
  {
    event_type: "doctor_queue",
    provider_template_name: "omnirelay_doctor_queue",
    language_code: "en",
    group_key: "doctor-queue",
    category: "UTILITY",
    variable_map: {
      "1": "doctor_name",
      "2": "clinic_name",
      "3": "shift_and_chamber",
      "4": "booking_count"
    },
    body_text: "Hello Dr. {{1}}, Sir\n\nYour upcoming schedule at {{2}}:\n\nShift: {{3}}\nTotal appointments: {{4}}\n\nPlease contact the clinic if any schedule adjustment is required.",
    sample_values: ["Khurshid Alam", "Neoclinic", "5th Aug 2 PM", "6"]
  },
  {
    event_type: "care_reminder",
    provider_template_name: "omnirelay_medication_reminder",
    language_code: "en",
    group_key: "care-reminder",
    category: "UTILITY",
    variable_map: {
      "1": "patient_name",
      "2": "clinic_name",
      "3": "schedule"
    },
    body_text: "Hello {{1}}, this is your scheduled medication reminder from {{2}}.\nSchedule: {{3}}\nFollow the instructions provided in your doctor-issued prescription. Do not change or stop medication without consulting your doctor.",
    sample_values: ["Rahul Sharma", "Neoclinic", "Evening dose after food"]
  },
  {
    event_type: "emergency_notice",
    provider_template_name: "omnirelay_emergency_notic",
    language_code: "en",
    group_key: "emergency-notice",
    category: "UTILITY",
    variable_map: {
      "1": "patient_name",
      "2": "clinic_name",
      "3": "closure_details",
      "4": "closure_date"
    },
    body_text: "Hello {{1}}, this is an important service update from {{2}} regarding your scheduled care: {{3}} will remain closed on {{4}}. Our team will contact you to reschedule. Please reply if you need assistance.",
    sample_values: ["Rahul Sharma", "Neoclinic", "Chamber 1", "31 July"]
  },
  {
    event_type: "booking_resume",
    provider_template_name: "omnirelay_booking_resume",
    language_code: "en",
    group_key: "booking-resume",
    category: "UTILITY",
    variable_map: {
      "1": "patient_name",
      "2": "clinic_name"
    },
    body_text: "Hello {{1}}, your appointment booking with {{2}} was not completed. Your previous selection has not been confirmed. Reply below if you would like to continue or contact the clinic.",
    sample_values: ["Rahul Sharma", "Neoclinic"]
  },
  {
    event_type: "payment_confirmation",
    provider_template_name: "omnirelay_payment_confirmation",
    language_code: "en",
    group_key: "payment",
    category: "UTILITY",
    variable_map: {
      "1": "patient_name",
      "2": "amount",
      "3": "doctor_name",
      "4": "payment_status",
      "5": "appointment_date_time",
      "6": "booking_reference",
      "7": "payment_reference"
    },
    body_text: "Hello {{1}}, we received your payment of ₹{{2}} for your appointment with Dr {{3}}.\nPayment status: {{4}}\nAppointment: {{5}}\nBooking reference: {{6}}\nPayment reference: {{7}}\nThanks",
    sample_values: ["Rahul", "300", "Ananya Sen", "Deposit received", "18 August 2026 at 5:30 PM", "OR-28491", "pay_QX2841"]
  },
  {
    event_type: "payment_action",
    provider_template_name: "omnirelay_payment_action",
    language_code: "en",
    group_key: "payment",
    category: "UTILITY",
    variable_map: {
      "1": "patient_name",
      "2": "doctor_name",
      "3": "payment_type",
      "4": "amount",
      "5": "due_date_time",
      "6": "booking_reference"
    },
    body_text: "Hello {{1}}, your selected appointment slot with Dr {{2}} is awaiting {{3}} payment.\nAmount: ₹{{4}}\nComplete payment securely before {{5}} to confirm the booking.\nBooking reference: {{6}}\n\nThanks for the Payment",
    sample_values: ["Rahul", "Ananya Sen", "Deposit", "300", "8 Aug, 4:30 PM", "OR-28491"]
  },
  {
    event_type: "marketing_campaign",
    provider_template_name: "omnirelay_patient_news",
    language_code: "en",
    group_key: "marketing-campaign",
    category: "MARKETING",
    variable_map: {
      "1": "patient_name",
      "2": "clinic_name",
      "3": "campaign_message"
    },
    body_text: "Hello {{1}}, {{2}}:\n{{3}}\n\nReply STOP anytime to unsubscribe.",
    sample_values: ["Rahul Sharma", "Neoclinic", "Free Eye & Vision Screening Camp this Sunday from 10 AM to 2 PM. Consult our expert ophthalmologists."]
  },
  {
    event_type: "care_campaign",
    provider_template_name: "omnirelay_care_update",
    language_code: "en",
    group_key: "care-campaign",
    category: "UTILITY",
    variable_map: {
      "1": "patient_name",
      "2": "clinic_name",
      "3": "care_update_details"
    },
    body_text: "Hello {{1}}, this is a health update from {{2}}:\n{{3}}\n\nPlease reply if you need assistance.",
    sample_values: ["Rahul Sharma", "Neoclinic", "Regular blood sugar monitoring is recommended for diabetic care. Contact us to schedule your routine review."]
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
      const DB_ALLOWED_EVENTS = new Set([
        "confirmation",
        "reminder_24h",
        "reminder_2h",
        "follow_up",
        "cancellation",
        "reschedule",
        "care_campaign",
        "marketing_campaign",
        "emergency_notice",
        "booking_otp",
        "doctor_queue",
        "care_reminder",
        "payment_action",
        "payment_confirmation",
      ]);

      const rowsToUpsert = targetSpecs
        .filter((item) => DB_ALLOWED_EVENTS.has(item.event_type))
        .map((item) => ({
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

      // Ensure active booking page exists for slot generation
      const { data: existingPage } = await supabase
        .from("booking_pages")
        .select("slug")
        .eq("organization_id", organization.id)
        .maybeSingle();

      if (!existingPage) {
        const rawSlug = (organization.name || "clinic")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "clinic";
        const slug = `${rawSlug}-${organization.id.slice(0, 6)}`;
        await supabase.from("booking_pages").insert({
          organization_id: organization.id,
          slug,
          headline: organization.name || "Clinic Appointments",
          description: "Official Online & WhatsApp Booking Page",
          accent_color: "#087fb9",
          active: true,
        });
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

