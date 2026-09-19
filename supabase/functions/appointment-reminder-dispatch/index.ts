import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54";
import { shouldSuppressAppointmentLifecycle } from "./policy.mjs";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
let publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL")?.replace(/\/$/, "") ?? "";
const client = createClient(url, serviceKey, { auth: { persistSession: false } });

type Reminder = {
  id: string;
  organization_id: string;
  appointment_id: string;
  event_type: string;
  recipient: string;
  scheduled_for: string;
  attempts: number;
  max_attempts: number;
  provider_response: Record<string, unknown> | null;
};

type Appointment = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  starts_at: string;
  status: string;
  follow_up_note: string | null;
  care_communications_consent: boolean;
  organization: { name: string };
  location: { name: string; address: string | null } | null;
  resource: { name: string } | null;
  service: { name: string } | null;
};

const digits = (value: string) => value.replace(/\D/g, "");
// Booking references live in the private booking-access table, not on
// public.appointments. Keep lifecycle delivery independent of that private
// credential surface while supplying a stable support reference to templates.
function appointmentReference(appointmentId: string) {
  return `APT-${appointmentId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
function parameters(eventType: string, appointment: Appointment, scheduledFor?: string) {
  const location = appointment.location?.name || appointment.location?.address || "the clinic";
  const doctor = (appointment.resource?.name || "your doctor").replace(/^dr\.?\s+/i, "");
  const service = appointment.service?.name || "Consultation";
  const date = new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
  }).format(new Date(appointment.starts_at));
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  }).format(new Date(appointment.starts_at));
  const followUpDue = new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
  }).format(new Date(scheduledFor || appointment.starts_at));
  const reference = appointmentReference(appointment.id);
  const values: Record<string, string[]> = {
    confirmation: [appointment.customer_name, doctor, appointment.organization.name, service, date, time, location, reference],
    reminder_24h: [appointment.customer_name, doctor, date, time, location, reference, "15"],
    reminder_2h: [appointment.customer_name, doctor, date, time, location, reference, "15"],
    cancellation: [appointment.customer_name, doctor, date, time, reference],
    reschedule: [appointment.customer_name, doctor, time, date, location, reference],
    follow_up: [appointment.customer_name, doctor, date, followUpDue],
  };
  return (values[eventType] || []).map((text) => ({ type: "text", text }));
}

async function release(reminder: Reminder, reason: string, retryable = true, consumeAttempt = true) {
  const effectiveAttempts = consumeAttempt ? reminder.attempts : Math.max(0, reminder.attempts - 1);
  const exhausted = effectiveAttempts >= reminder.max_attempts;
  await client.from("reminder_events").update({
    status: retryable && !exhausted ? "scheduled" : "failed",
    attempts: effectiveAttempts,
    next_attempt_at: retryable && !exhausted ? new Date(Date.now() + (consumeAttempt ? Math.min(60, Math.max(1, effectiveAttempts) * 5) : 30) * 60_000).toISOString() : null,
    failure_reason: reason,
    provider_response: { ...(reminder.provider_response || {}), blocked_reason: reason },
    updated_at: new Date().toISOString(),
  }).eq("id", reminder.id).eq("status", "processing");
}

Deno.serve(async (request) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token || token !== serviceKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!publicSiteUrl) {
    const { data } = await client.rpc("get_public_site_url");
    publicSiteUrl = typeof data === "string" ? data.replace(/\/$/, "") : "";
  }
  if (!publicSiteUrl) return Response.json({ error: "PUBLIC_SITE_URL is required." }, { status: 503 });

  const { data: claimed, error: claimError } = await client.rpc("claim_due_appointment_reminders", { p_limit: 20 });
  if (claimError) return Response.json({ error: claimError.message }, { status: 500 });

  let queued = 0;
  let deferred = 0;
  let failed = 0;

  for (const raw of claimed || []) {
    const reminder = raw as Reminder;
    const { data: appointment } = await client.from("appointments")
      .select("id,customer_name,customer_phone,starts_at,status,follow_up_note,care_communications_consent,organization:organizations!inner(name),location:business_locations(name,address),resource:booking_resources(name),service:organization_services(name)")
      .eq("id", reminder.appointment_id).single();

    if (!appointment) { await release(reminder, "Appointment no longer exists.", false); failed++; continue; }
    const row = appointment as unknown as Appointment;
    if (!row.care_communications_consent) { await release(reminder, "Patient care-communication consent is not active.", false); failed++; continue; }
    if (["cancelled", "completed", "no_show"].includes(row.status) && reminder.event_type !== "cancellation") {
      await client.from("reminder_events").update({ status: "cancelled", failure_reason: "Appointment is no longer active.", updated_at: new Date().toISOString() }).eq("id", reminder.id);
      continue;
    }
    if (shouldSuppressAppointmentLifecycle(reminder.event_type, row.starts_at)) {
      await client.from("reminder_events").update({
        status: "cancelled",
        failure_reason: "Suppressed because the appointment time has already passed.",
        next_attempt_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", reminder.id).eq("status", "processing");
      continue;
    }

    const [{ data: template }, { data: orgAddress }, { data: bookingPage }] = await Promise.all([
      client.from("channel_message_templates").select("provider_template_name,language_code")
        .eq("organization_id", reminder.organization_id).eq("channel", "whatsapp")
        .eq("event_type", reminder.event_type).eq("status", "approved").maybeSingle(),
      client.from("organizations_addresses").select("address").eq("organization_id", reminder.organization_id)
        .eq("service", "whatsapp").eq("status", "connected").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("booking_pages").select("slug").eq("organization_id", reminder.organization_id).eq("active", true).maybeSingle(),
    ]);
    if (!template || !orgAddress || !bookingPage) {
      const reason = !template
        ? `Approved Meta template is missing for ${reminder.event_type}.`
        : !orgAddress ? "WhatsApp channel is not connected." : "Public booking page is not active.";
      await release(reminder, reason, true, false);
      deferred++;
      continue;
    }

    const phone = digits(reminder.recipient || row.customer_phone || "");
    if (!phone) { await release(reminder, "Patient mobile number is missing.", false); failed++; continue; }

    let { data: contactAddress } = await client.from("contacts_addresses").select("contact_id,address")
      .eq("organization_id", reminder.organization_id).eq("service", "whatsapp").eq("address", phone).maybeSingle();
    if (!contactAddress) {
      const { data: contact } = await client.from("contacts").insert({ organization_id: reminder.organization_id, name: row.customer_name, status: "active" }).select("id").single();
      if (contact) contactAddress = (await client.from("contacts_addresses").insert({
        organization_id: reminder.organization_id, contact_id: contact.id, service: "whatsapp", address: phone,
        name: row.customer_name, status: "active", extra: { source: "appointment_reminder", consent: true },
      }).select("contact_id,address").single()).data;
    }
    if (!contactAddress) { await release(reminder, "Patient messaging contact could not be prepared."); failed++; continue; }

    let { data: conversation } = await client.from("conversations").select("id")
      .eq("organization_id", reminder.organization_id).eq("service", "whatsapp")
      .eq("organization_address", orgAddress.address).eq("contact_address", phone).maybeSingle();
    if (!conversation) conversation = (await client.from("conversations").insert({
      organization_id: reminder.organization_id, service: "whatsapp", organization_address: orgAddress.address,
      contact_address: phone, name: row.customer_name, status: "active", extra: { source: "appointment_reminder" },
    }).select("id").single()).data;
    if (!conversation) { await release(reminder, "Patient conversation could not be prepared."); failed++; continue; }

    const dispatchKey = `appointment-reminder:${reminder.id}`;
    const { data: existingMessage } = await client.from("messages").select("id")
      .eq("organization_id", reminder.organization_id)
      .contains("status", { omnirelay_dispatch_key: dispatchKey })
      .maybeSingle();
    if (existingMessage) {
      await client.from("reminder_events").update({
        status: "sent", message_id: existingMessage.id, sent_at: new Date().toISOString(), next_attempt_at: null,
        failure_reason: null, provider_response: { queued: true, message_id: existingMessage.id, recovered: true }, updated_at: new Date().toISOString(),
      }).eq("id", reminder.id).eq("status", "processing");
      queued++;
      continue;
    }

    // Active Billing Pre-flight Check (Inactive by default)
    if (Deno.env.get("ENABLE_ACTIVE_BILLING") === "true") {
      const { data: canSend, error: billingError } = await client.rpc("can_send_message", {
        p_organization_id: reminder.organization_id,
        p_category: "utility"
      });
      
      if (billingError || canSend === false) {
        await release(reminder, "Insufficient wallet balance to dispatch this message.", false, false);
        failed++;
        continue;
      }
    }

    const { data: message, error: messageError } = await client.from("messages").insert({
      organization_id: reminder.organization_id, conversation_id: conversation.id, service: "whatsapp",
      organization_address: orgAddress.address, contact_address: phone, direction: "outgoing",
      content: { version: "1", type: "data", kind: "template", data: {
        name: template.provider_template_name, language: { code: template.language_code || "en" },
        components: [{ type: "body", parameters: parameters(reminder.event_type, row, reminder.scheduled_for) }],
      } },
      status: { pending: new Date().toISOString(), omnirelay_dispatch_key: dispatchKey },
    }).select("id").single();
    if (messageError || !message) { await release(reminder, messageError?.message || "Message could not be queued."); failed++; continue; }

    await client.from("reminder_events").update({
      status: "sent", message_id: message.id, sent_at: new Date().toISOString(), next_attempt_at: null,
      failure_reason: null, provider_response: { queued: true, message_id: message.id }, updated_at: new Date().toISOString(),
    }).eq("id", reminder.id).eq("status", "processing");
    queued++;
  }

  return Response.json({ processed: claimed?.length || 0, queued, deferred, failed });
});
