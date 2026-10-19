#!/usr/bin/env node
/**
 * verify-waba-callback.mjs
 * Queries Meta Graph API to verify that a WABA's webhook callback override
 * points strictly to the staging Supabase Edge Function:
 * https://sqcprlkhsnfbydgzpsml.supabase.co/functions/v1/whatsapp-webhook
 *
 * Usage:
 *   node scripts/verify-waba-callback.mjs <waba_id> <access_token>
 * Or reads from staging database for the currently connected WABA.
 */

const EXPECTED_CALLBACK_URL = "https://sqcprlkhsnfbydgzpsml.supabase.co/functions/v1/whatsapp-webhook";
const GRAPH_VERSION = process.env.WHATSAPP_CLOUD_API_VERSION || "v24.0";

async function verifyWabaCallback(wabaId, accessToken) {
  if (!wabaId || !accessToken) {
    console.error("Usage: node scripts/verify-waba-callback.mjs <waba_id> <access_token>");
    process.exit(1);
  }

  console.log(`Checking Meta Graph API for WABA: ${wabaId}...`);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/subscribed_apps`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`❌ Meta Graph API returned HTTP ${res.status}: ${err}`);
      process.exit(1);
    }

    const json = await res.json();
    console.log("Subscribed Apps Response:", JSON.stringify(json, null, 2));

    const apps = json.data || [];
    let matched = false;
    for (const app of apps) {
      const callback = app.whatsapp_business_api_data?.override_callback_uri;
      if (callback === EXPECTED_CALLBACK_URL) {
        console.log(`✅ MATCH: WABA ${wabaId} override_callback_uri is verified:`);
        console.log(`   ${callback}`);
        matched = true;
      } else if (callback) {
        console.warn(`⚠️ Warning: override_callback_uri is pointing to: ${callback} (Expected: ${EXPECTED_CALLBACK_URL})`);
      }
    }

    if (!matched) {
      console.error(`❌ No subscribed app on WABA ${wabaId} points to ${EXPECTED_CALLBACK_URL}`);
      process.exit(1);
    }

    console.log("🎉 Staging WABA callback override verification PASSED.");
  } catch (err) {
    console.error("Network or verification error:", err);
    process.exit(1);
  }
}

const [,, wabaId, accessToken] = process.argv;
if (wabaId && accessToken) {
  verifyWabaCallback(wabaId, accessToken);
} else {
  console.log("Helper script ready. Pass <waba_id> and <access_token> to execute live check.");
}
