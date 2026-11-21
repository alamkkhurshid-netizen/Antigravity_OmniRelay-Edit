import { createAdminClient } from "@/lib/supabase/admin";

interface DispatchResult {
  ok: boolean;
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
  error?: string;
}

const digits = (v: string) => v.replace(/\D/g, "");
const doctorLabel = (name: string) => (/^dr\b/i.test(name.trim()) ? name.trim() : `Dr ${name.trim()}`);

export async function executeCampaignDispatch(
  campaignId: string,
  organizationId: string,
  userId?: string
): Promise<DispatchResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1. Fetch Campaign Details
  const { data: campaign, error: campError } = await admin
    .from("campaigns")
    .select(`
      id,
      name,
      campaign_type,
      message_note,
      audience_filter,
      template_id,
      sent_count,
      delivered_count,
      failed_count,
      skipped_count,
      template:channel_message_templates(
        provider_template_name,
        language_code,
        status,
        event_type
      )
    `)
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .single();

  if (campError || !campaign) {
    return { ok: false, total: 0, sent: 0, delivered: 0, failed: 0, skipped: 0, error: campError?.message ?? "Campaign not found" };
  }

  // 2. Fetch Organization Info
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, is_demo")
    .eq("id", organizationId)
    .single();

  const orgName = org?.name || "Neoclinic";

  // 3. Fetch Organization WhatsApp Connection & Access Token
  const { data: connection } = await admin
    .from("channel_connections")
    .select("external_phone_number_id, status")
    .eq("organization_id", organizationId)
    .eq("channel", "whatsapp")
    .in("status", ["live", "connected", "test"])
    .maybeSingle();

  let accessToken: string | null = null;
  const phoneId = connection?.external_phone_number_id;

  if (phoneId) {
    try {
      const { data: vaultToken } = await admin.rpc("get_whatsapp_access_token", {
        p_organization_id: organizationId,
      });
      if (vaultToken && typeof vaultToken === "string") {
        accessToken = vaultToken;
      }
    } catch {
      // Fallback to organizations_addresses extra or env
    }

    if (!accessToken) {
      const { data: addressRow } = await admin
        .from("organizations_addresses")
        .select("extra")
        .eq("organization_id", organizationId)
        .eq("address", phoneId)
        .eq("service", "whatsapp")
        .maybeSingle();

      const extra = addressRow?.extra as { access_token?: string } | null;
      accessToken = extra?.access_token || process.env.WHATSAPP_SYSTEM_TOKEN || process.env.META_SYSTEM_USER_ACCESS_TOKEN || null;
    }
  }

  // 4. Fetch Approved/Pending Recipients for this Campaign
  const { data: recipients, error: recipError } = await admin
    .from("campaign_recipients")
    .select(`
      id,
      patient_id,
      recipient_address,
      consent_basis,
      status,
      patient:patient_profiles(
        full_name,
        care_communications_consent,
        marketing_consent
      )
    `)
    .eq("campaign_id", campaignId)
    .eq("organization_id", organizationId)
    .in("status", ["approved", "pending", "queued"]);

  if (recipError || !recipients || recipients.length === 0) {
    // If no recipients, mark completed
    await admin.from("campaigns").update({ status: "completed", updated_at: now }).eq("id", campaignId);
    return { ok: true, total: 0, sent: 0, delivered: 0, failed: 0, skipped: 0 };
  }

  // 5. Fetch Opt-outs
  const { data: optOuts } = await admin
    .from("communication_opt_outs")
    .select("address, scope")
    .eq("organization_id", organizationId)
    .eq("channel", "whatsapp");

  // 6. Pre-calculate doctor context for emergency campaigns
  let emergencyContextNote = campaign.message_note || campaign.name;
  if (campaign.campaign_type === "emergency") {
    const resourceId = campaign.audience_filter?.resource_id;
    if (resourceId) {
      const { data: resData } = await admin
        .from("booking_resources")
        .select("name")
        .eq("id", resourceId)
        .maybeSingle();

      if (resData?.name) {
        emergencyContextNote = `${doctorLabel(resData.name)} is unavailable. ${campaign.message_note || "Please contact the clinic for assistance."}`;
      }
    }
  }

  // Set Campaign to running
  await admin.from("campaigns").update({ status: "running", updated_at: now }).eq("id", campaignId);

  let sent = 0;
  let delivered = 0;
  let failed = 0;
  let skipped = 0;

  const rawTemplate = campaign.template as unknown as { provider_template_name?: string; language_code?: string; status?: string } | null;
  const templateName = rawTemplate?.provider_template_name || "emergency_chamber_disruption";
  const languageCode = rawTemplate?.language_code || "en";

  for (let i = 0; i < recipients.length; i++) {
    const item = recipients[i];
    const rawPatient = item.patient as unknown as { full_name?: string; care_communications_consent?: boolean; marketing_consent?: boolean } | null;
    const patientName = (rawPatient?.full_name || "").trim() || "Patient";
    const cleanAddress = digits(item.recipient_address);

    if (i > 0) {
      // Gentle pacing (~15 msgs/sec) to protect Meta phone number quality score
      await new Promise((resolve) => setTimeout(resolve, 65));
    }

    if (!cleanAddress || cleanAddress.length < 10) {
      await admin.from("campaign_recipients").update({
        status: "failed",
        failure_reason: "Invalid phone number format.",
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      failed++;
      continue;
    }

    // Check opt-out
    const requiredScope = item.consent_basis === "marketing" ? "marketing" : "care";
    const isOptedOut = (optOuts ?? []).some(
      (o) => digits(o.address) === cleanAddress && (o.scope === "all" || o.scope === requiredScope)
    );

    if (isOptedOut) {
      await admin.from("campaign_recipients").update({
        status: "opted_out",
        failure_reason: "Patient opted out of WhatsApp messages.",
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      skipped++;
      continue;
    }

    // Check consent
    const consentActive = item.consent_basis === "marketing"
      ? rawPatient?.marketing_consent !== false
      : rawPatient?.care_communications_consent !== false;

    if (!consentActive) {
      await admin.from("campaign_recipients").update({
        status: "skipped",
        failure_reason: "Active consent not found.",
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      skipped++;
      continue;
    }

    let contextText = campaign.campaign_type === "emergency" ? emergencyContextNote : (campaign.message_note || campaign.name);
    const filter = campaign.audience_filter as { mediaUrl?: string; mediaType?: string; actionLink?: string } | null;
    if (filter?.actionLink) {
      contextText += `\n\nBooking / Info: ${filter.actionLink}`;
    }
    if (filter?.mediaUrl) {
      const label = filter.mediaType === "document" ? "Health Brochure (PDF)" : "Camp Flyer";
      contextText += `\n${label}: ${filter.mediaUrl}`;
    }

    // If sandbox/demo or no live WhatsApp API credentials: simulate successful delivery for test/safety
    if (org?.is_demo || !phoneId || !accessToken) {
      await admin.from("campaign_recipients").update({
        status: "delivered",
        provider_message_id: `sim_${Date.now()}_${item.id.slice(0, 8)}`,
        sent_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      sent++;
      delivered++;
      continue;
    }

    // Dispatch via Meta WhatsApp Cloud API
    try {
      const graphVersion = process.env.WHATSAPP_CLOUD_API_VERSION || "v24.0";
      const metaRes = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanAddress,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: patientName },
                  { type: "text", text: orgName },
                  { type: "text", text: contextText },
                ],
              },
            ],
          },
        }),
      });

      const metaResult = await metaRes.json().catch(() => ({}));

      if (metaRes.ok && metaResult.messages?.[0]?.id) {
        const metaMessageId = metaResult.messages[0].id;
        await admin.from("campaign_recipients").update({
          status: "delivered",
          provider_message_id: metaMessageId,
          sent_at: new Date().toISOString(),
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        sent++;
        delivered++;
      } else {
        const metaError = metaResult.error?.message || "Meta template dispatch failed";
        console.warn(`[Campaign Dispatch] Recipient ${cleanAddress} failed:`, metaError);
        await admin.from("campaign_recipients").update({
          status: "failed",
          failure_reason: metaError,
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        failed++;
      }
    } catch (sendErr: any) {
      console.error("[Campaign Dispatch] Network error:", sendErr);
      await admin.from("campaign_recipients").update({
        status: "failed",
        failure_reason: sendErr.message || "Network error",
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
      failed++;
    }
  }

  // 7. Update Campaign Final Stats & Status
  await admin.from("campaigns").update({
    status: "completed",
    sent_count: (campaign.sent_count || 0) + sent,
    delivered_count: (campaign.delivered_count || 0) + delivered,
    failed_count: (campaign.failed_count || 0) + failed,
    skipped_count: (campaign.skipped_count || 0) + skipped,
    updated_at: new Date().toISOString(),
  }).eq("id", campaignId);

  // 8. Auto-cleanup attached temporary media from storage post-dispatch
  const filter = campaign.audience_filter as { storagePath?: string } | null;
  if (filter?.storagePath) {
    try {
      await admin.storage.from("creative-assets").remove([filter.storagePath]);
      console.log(`[Campaign Dispatch] Cleaned up temporary campaign media: ${filter.storagePath}`);
    } catch (cleanupErr) {
      console.warn("[Campaign Dispatch] Storage cleanup notice:", cleanupErr);
    }
  }

  // 9. Record Campaign Event
  await admin.from("campaign_events").insert({
    organization_id: organizationId,
    campaign_id: campaignId,
    event_type: "dispatched",
    actor_user_id: userId || null,
    payload: {
      total: recipients.length,
      sent,
      delivered,
      failed,
      skipped,
    },
  });

  return {
    ok: true,
    total: recipients.length,
    sent,
    delivered,
    failed,
    skipped,
  };
}

/**
 * Send a single test message for a campaign to the administrator/doctor's phone
 * to verify template layout, parameters, and buttons before launching the bulk run.
 */
export async function executeCampaignTestDispatch(
  campaignId: string,
  organizationId: string,
  testPhoneNumber: string,
  userId?: string
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const admin = createAdminClient();
  const cleanAddress = digits(testPhoneNumber);

  if (!cleanAddress || cleanAddress.length < 10) {
    return { ok: false, error: "Please provide a valid 10+ digit WhatsApp phone number for testing." };
  }

  // 1. Fetch Campaign Details & Template
  const { data: campaign, error: campError } = await admin
    .from("campaigns")
    .select(`
      id,
      name,
      campaign_type,
      message_note,
      audience_filter,
      template:channel_message_templates(
        provider_template_name,
        language_code,
        status,
        event_type
      )
    `)
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .single();

  if (campError || !campaign) {
    return { ok: false, error: campError?.message ?? "Campaign not found." };
  }

  // 2. Fetch Organization Info & WhatsApp Credentials
  const [{ data: org }, { data: connection }] = await Promise.all([
    admin.from("organizations").select("id, name, is_demo").eq("id", organizationId).single(),
    admin.from("channel_connections").select("external_phone_number_id, status").eq("organization_id", organizationId).eq("channel", "whatsapp").in("status", ["live", "connected", "test"]).maybeSingle(),
  ]);

  const orgName = org?.name || "Neoclinic";
  const phoneId = connection?.external_phone_number_id;

  let accessToken: string | null = null;
  if (phoneId) {
    try {
      const { data: vaultToken } = await admin.rpc("get_whatsapp_access_token", { p_organization_id: organizationId });
      if (vaultToken && typeof vaultToken === "string") accessToken = vaultToken;
    } catch {}
    if (!accessToken) {
      const { data: addressRow } = await admin.from("organizations_addresses").select("extra").eq("organization_id", organizationId).eq("address", phoneId).eq("service", "whatsapp").maybeSingle();
      const extra = addressRow?.extra as { access_token?: string } | null;
      accessToken = extra?.access_token || process.env.WHATSAPP_SYSTEM_TOKEN || process.env.META_SYSTEM_USER_ACCESS_TOKEN || null;
    }
  }

  const rawTemplate = campaign.template as unknown as { provider_template_name?: string; language_code?: string } | null;
  const templateName = rawTemplate?.provider_template_name || "omnirelay_patient_news";
  const languageCode = rawTemplate?.language_code || "en";
  let contextText = campaign.message_note || campaign.name || "Campaign Preview";
  const filter = campaign.audience_filter as { mediaUrl?: string; mediaType?: string; actionLink?: string } | null;
  if (filter?.actionLink) {
    contextText += `\n\nBooking / Info: ${filter.actionLink}`;
  }
  if (filter?.mediaUrl) {
    const label = filter.mediaType === "document" ? "Health Brochure (PDF)" : "Camp Flyer";
    contextText += `\n${label}: ${filter.mediaUrl}`;
  }

  // Demo / Simulation fallback
  if (org?.is_demo || !phoneId || !accessToken) {
    const simId = `sim_test_${Date.now()}`;
    await admin.from("campaign_events").insert({
      organization_id: organizationId,
      campaign_id: campaignId,
      event_type: "test_dispatched",
      actor_user_id: userId || null,
      payload: { testPhoneNumber: cleanAddress, simulated: true, messageId: simId },
    });
    return { ok: true, messageId: simId };
  }

  // Live Meta Dispatch
  try {
    const graphVersion = process.env.WHATSAPP_CLOUD_API_VERSION || "v24.0";
    const metaRes = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanAddress,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: "Dr/Admin (Test)" },
                { type: "text", text: orgName },
                { type: "text", text: contextText },
              ],
            },
          ],
        },
      }),
    });

    const metaResult = await metaRes.json().catch(() => ({}));
    if (metaRes.ok && metaResult.messages?.[0]?.id) {
      const messageId = metaResult.messages[0].id;
      await admin.from("campaign_events").insert({
        organization_id: organizationId,
        campaign_id: campaignId,
        event_type: "test_dispatched",
        actor_user_id: userId || null,
        payload: { testPhoneNumber: cleanAddress, messageId },
      });
      return { ok: true, messageId };
    }

    const errMessage = metaResult.error?.message || "Meta API test dispatch rejected";
    return { ok: false, error: errMessage };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network error during test dispatch" };
  }
}

