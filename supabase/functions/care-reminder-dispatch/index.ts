import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const client = createClient(url, serviceKey, { auth: { persistSession: false } });

type Run = {
  id: string;
  organization_id: string;
  patient_id: string;
  reminder_id: string;
  attempt_count: number;
  max_attempts: number;
  reminder: {
    title: string;
    instructions: string | null;
    reminder_type: string;
  };
  patient: { full_name: string; phone: string | null; care_communications_consent: boolean };
};

async function release(run: Run, reason: string, retryable = true, consumeAttempt = true) {
  const effectiveAttempts = consumeAttempt ? run.attempt_count : Math.max(0, run.attempt_count - 1);
  const exhausted = effectiveAttempts >= run.max_attempts;
  await client.from("care_reminder_runs").update({
    status: retryable && !exhausted ? "approved" : "failed",
    attempt_count: effectiveAttempts,
    next_attempt_at: retryable && !exhausted
      ? new Date(Date.now() + (consumeAttempt ? Math.min(60, Math.max(1, effectiveAttempts) * 5) : 30) * 60_000).toISOString()
      : null,
    failure_reason: reason,
    updated_at: new Date().toISOString(),
  }).eq("id", run.id).eq("status", "processing");
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

Deno.serve(async (request) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token || token !== serviceKey) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: runs, error } = await client.rpc("claim_due_care_reminder_runs", { p_limit: 20 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let queued = 0;
  let failed = 0;

  for (const raw of runs ?? []) {
    const claimedRun = raw as unknown as Omit<Run, "reminder" | "patient">;
    const { data: details } = await client
      .from("care_reminder_runs")
      .select("id,organization_id,patient_id,reminder_id,attempt_count,max_attempts,reminder:care_reminders(title,instructions,reminder_type),patient:patient_profiles(full_name,phone,care_communications_consent)")
      .eq("id", claimedRun.id)
      .single();
    if (!details) {
      await client.from("care_reminder_runs").update({
        status: "failed",
        failure_reason: "Reminder details could not be loaded.",
        updated_at: new Date().toISOString(),
      }).eq("id", claimedRun.id).eq("status", "processing");
      failed++;
      continue;
    }
    const run = details as unknown as Run;
    const attempts = run.attempt_count;
    const patient = run.patient;
    if (!patient?.care_communications_consent || !text(patient.phone)) {
      await client.from("care_reminder_runs").update({
        status: "skipped",
        attempt_count: attempts,
        failure_reason: !patient?.care_communications_consent ? "Care communication consent is not active." : "Patient mobile number is missing.",
        updated_at: new Date().toISOString(),
      }).eq("id", run.id).eq("status", "processing");
      failed++;
      continue;
    }

    const { data: template } = await client
      .from("channel_message_templates")
      .select("provider_template_name,language_code")
      .eq("organization_id", run.organization_id)
      .eq("channel", "whatsapp")
      .eq("event_type", run.reminder.reminder_type === "follow_up" ? "follow_up" : "care_reminder")
      .eq("status", "approved")
      .maybeSingle();

    const [{ data: orgAddress }, { data: organization }] = await Promise.all([
      client.from("organizations_addresses").select("address")
        .eq("organization_id", run.organization_id).eq("service", "whatsapp")
        .eq("status", "connected").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("organizations").select("name").eq("id", run.organization_id).maybeSingle(),
    ]);

    if (!template || !orgAddress) {
      await release(run, !template ? "Approved Meta care-reminder template is not configured." : "WhatsApp channel is not connected.", true, false);
      failed++;
      continue;
    }

    const digits = patient.phone!.replace(/\D/g, "");
    let { data: contactAddress } = await client
      .from("contacts_addresses")
      .select("contact_id,address")
      .eq("organization_id", run.organization_id)
      .eq("service", "whatsapp")
      .eq("address", digits)
      .maybeSingle();

    if (!contactAddress) {
      const { data: contact } = await client.from("contacts").insert({
        organization_id: run.organization_id,
        name: patient.full_name,
        status: "active",
      }).select("id").single();
      if (contact) {
        const created = await client.from("contacts_addresses").insert({
          organization_id: run.organization_id,
          contact_id: contact.id,
          service: "whatsapp",
          address: digits,
          name: patient.full_name,
          status: "active",
          extra: { source: "care_reminder", consent: true },
        }).select("contact_id,address").single();
        contactAddress = created.data;
      }
    }

    if (!contactAddress) {
      await release(run, "Patient messaging contact could not be prepared.");
      failed++;
      continue;
    }

    let { data: conversation } = await client.from("conversations")
      .select("id")
      .eq("organization_id", run.organization_id)
      .eq("service", "whatsapp")
      .eq("organization_address", orgAddress.address)
      .eq("contact_address", digits)
      .maybeSingle();
    if (!conversation) {
      const created = await client.from("conversations").insert({
        organization_id: run.organization_id,
        service: "whatsapp",
        organization_address: orgAddress.address,
        contact_address: digits,
        name: patient.full_name,
        status: "active",
        extra: { source: "care_reminder" },
      }).select("id").single();
      conversation = created.data;
    }

    if (!conversation) {
      await release(run, "Patient conversation could not be prepared.");
      failed++;
      continue;
    }

    const dispatchKey = `care-reminder:${run.id}`;
    const { data: existingMessage } = await client.from("messages").select("id")
      .eq("organization_id", run.organization_id)
      .contains("status", { omnirelay_dispatch_key: dispatchKey })
      .maybeSingle();
    if (existingMessage) {
      await client.from("care_reminder_runs").update({
        status: "sent",
        provider_response: { message_id: existingMessage.id, queued: true, recovered: true },
        sent_at: new Date().toISOString(),
        failure_reason: null,
        next_attempt_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", run.id).eq("status", "processing");
      queued++;
      continue;
    }

    const { data: message, error: messageError } = await client.from("messages").insert({
      organization_id: run.organization_id,
      conversation_id: conversation.id,
      service: "whatsapp",
      organization_address: orgAddress.address,
      contact_address: digits,
      direction: "outgoing",
      content: {
        version: "1",
        type: "data",
        kind: "template",
        data: {
          name: template.provider_template_name,
          language: { code: template.language_code || "en" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: patient.full_name },
              { type: "text", text: organization?.name || "Your clinic" },
              { type: "text", text: run.reminder.title || run.reminder.instructions || "Scheduled reminder" },
            ],
          }],
        },
      },
      status: { pending: new Date().toISOString(), omnirelay_dispatch_key: dispatchKey },
    }).select("id").single();

    if (messageError || !message) {
      await release(run, messageError?.message ?? "Message could not be queued.");
      failed++;
      continue;
    }

    await client.from("care_reminder_runs").update({
      status: "sent",
      attempt_count: attempts,
      provider_response: { message_id: message.id, queued: true },
      sent_at: new Date().toISOString(),
      failure_reason: null,
      next_attempt_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", run.id).eq("status", "processing");
    queued++;
  }

  return Response.json({ processed: runs?.length ?? 0, queued, failed });
});
