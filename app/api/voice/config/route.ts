import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, organization } = await getWorkspace();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!organization) {
      return NextResponse.json({ error: "Workspace organization not found." }, { status: 404 });
    }

    const { data: config, error } = await supabase
      .from("voice_agent_configs")
      .select("*")
      .eq("org_id", organization.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("[VOICE_CONFIG_GET] Database error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Default smart configuration for a new clinic
    const defaultConfig = {
      org_id: organization.id,
      clinic_name: organization.name || "My Clinic",
      bot_name: "Maya",
      agent_persona: "receptionist",
      voice_id: "sonic-english-indian-1",
      virtual_number: "08047283676",
      receptionist_phone: "",
      greeting_message: `Hello! Thank you for calling ${organization.name || "our clinic"}. How can I assist you with your appointment today?`,
      primary_language: "en-IN",
      auto_language_switch: true,
      enabled_languages: ["en-IN", "hi-IN", "kn-IN", "ta-IN", "te-IN"],
      operating_hours: {
        mon_sat: "09:00 - 19:00",
        sunday: "closed",
      },
      emergency_instructions: "In case of severe medical emergency, please call 108 or proceed to the nearest emergency hospital immediately.",
      sms_confirmation_enabled: true,
      whatsapp_confirmation_enabled: true,
      is_active: true,
      onboarding_completed: false,
      telephony_mode: "smart_forwarding",
      forwarding_carrier: "airtel",
      forwarding_phone_number: "",
      vmn_number: null,
      vmn_status: "none",
      business_vertical: "healthcare",
      business_category: "dental",
      vertical_settings: {
        vertical: "healthcare",
        enable_booking: true,
        enable_emergency_bypass: true,
        order_tracking_enabled: false,
        room_reservation_enabled: false
      },
      receptionist_eq_tone: "empathetic",
      sales_agent_name: "Rohan",
      sales_agent_active: true,
      sales_eq_style: "consultative",
      sales_packages: [
        { name: "Comprehensive Dental & Scaling Package", price_inr: 999, description: "Ultrasonic scaling, intraoral checkup & polish" },
        { name: "Teeth Whitening & Smile Makeover", price_inr: 4999, description: "Laser whitening with protective mineral seal" }
      ],
      sales_campaign_type: "promotional_leads",
      outbound_calling_window: { start: "09:30", end: "19:30" },
    };

    return NextResponse.json({
      config: config || defaultConfig,
      is_new: !config,
    });
  } catch (err: any) {
    console.error("[VOICE_CONFIG_GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!organization) {
      return NextResponse.json({ error: "Workspace organization not found." }, { status: 404 });
    }

    const body = await request.json();

    const businessName = (body.clinic_name || body.business_name || "").trim();
    if (!businessName) {
      return NextResponse.json({ error: "Business / Clinic name is required." }, { status: 400 });
    }

    if (!body.receptionist_phone?.trim()) {
      return NextResponse.json(
        { error: "Phone number for escalation / human transfer is required." },
        { status: 400 }
      );
    }

    const businessVertical = body.business_vertical || "healthcare";
    const verticalSettings = body.vertical_settings || {
      vertical: businessVertical,
      enable_booking: true,
      enable_emergency_bypass: businessVertical === "healthcare",
      order_tracking_enabled: businessVertical === "retail",
      room_reservation_enabled: businessVertical === "hospitality"
    };

    const payload = {
      org_id: organization.id,
      clinic_name: businessName,
      bot_name: body.bot_name?.trim() || (businessVertical === "retail" ? "Priya" : businessVertical === "hospitality" ? "Aria" : "Maya"),
      agent_persona: body.agent_persona || "receptionist",
      voice_id: body.voice_id || "sonic-english-indian-1",
      virtual_number: body.virtual_number || "08047283676",
      receptionist_phone: body.receptionist_phone.trim(),
      greeting_message: body.greeting_message?.trim() || `Hello! Thank you for calling ${businessName}. How can I help you today?`,
      primary_language: body.primary_language || "en-IN",
      auto_language_switch: body.auto_language_switch !== false,
      enabled_languages: Array.isArray(body.enabled_languages) && body.enabled_languages.length > 0
        ? body.enabled_languages
        : ["en-IN", "hi-IN", "kn-IN"],
      operating_hours: body.operating_hours || { mon_sat: "09:00 - 19:00", sunday: "closed" },
      emergency_instructions: body.emergency_instructions || "Call 108 or proceed to the nearest emergency hospital immediately.",
      sms_confirmation_enabled: body.sms_confirmation_enabled !== false,
      whatsapp_confirmation_enabled: body.whatsapp_confirmation_enabled !== false,
      is_active: body.is_active !== false,
      onboarding_completed: true,
      telephony_mode: body.telephony_mode || "smart_forwarding",
      forwarding_carrier: body.forwarding_carrier || "airtel",
      forwarding_phone_number: body.forwarding_phone_number?.trim() || "",
      vmn_number: body.vmn_number?.trim() || null,
      vmn_status: body.vmn_status || (body.vmn_number ? "active" : "none"),
      vmn_plan_active: body.vmn_plan_active === true,
      business_vertical: businessVertical,
      business_category: body.business_category || (businessVertical === "retail" ? "fashion" : businessVertical === "hospitality" ? "luxury_hotel" : "dental"),
      vertical_settings: verticalSettings,
      receptionist_eq_tone: body.receptionist_eq_tone || "empathetic",
      sales_agent_name: body.sales_agent_name?.trim() || (businessVertical === "retail" ? "Kabir" : businessVertical === "hospitality" ? "Neil" : "Rohan"),
      sales_agent_active: body.sales_agent_active !== false,
      sales_eq_style: body.sales_eq_style || "consultative",
      sales_packages: Array.isArray(body.sales_packages) && body.sales_packages.length > 0
        ? body.sales_packages
        : [
            { name: "Consultation & Health Screening", price_inr: 799, description: "Full diagnostic assessment" }
          ],
      sales_campaign_type: body.sales_campaign_type || "promotional_leads",
      outbound_calling_window: body.outbound_calling_window || { start: "09:30", end: "19:30" },
      updated_at: new Date().toISOString(),
    };

    const { data: savedConfig, error } = await supabase
      .from("voice_agent_configs")
      .upsert(payload, { onConflict: "org_id" })
      .select("*")
      .single();

    if (error) {
      console.error("[VOICE_CONFIG_POST] Supabase upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      config: savedConfig,
      message: "Voice AI settings saved and synced successfully.",
    });
  } catch (err: any) {
    console.error("[VOICE_CONFIG_POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
