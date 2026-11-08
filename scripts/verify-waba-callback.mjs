#!/usr/bin/env node
/**
 * verify-waba-callback.mjs
 * Queries Meta Graph API to verify that a WABA's webhook callback override
 * points strictly to the staging Supabase Edge Function:
 * https://sqcprlkhsnfbydgzpsml.supabase.co/functions/v1/whatsapp-webhook
 *
 * Security: Reads access token strictly from META_ACCESS_TOKEN environment variable.
 * Never pass access tokens as command line arguments or log them in terminal output.
 *
 * Usage:
 *   $env:META_ACCESS_TOKEN="<token>"  # (or export META_ACCESS_TOKEN="<token>")
 *   node scripts/verify-waba-callback.mjs <waba_id>
 */

const EXPECTED_CALLBACK_URL = "https://sqcprlkhsnfbydgzpsml.supabase.co/functions/v1/whatsapp-webhook";
const GRAPH_VERSION = process.env.WHATSAPP_CLOUD_API_VERSION || "v24.0";

async function verifyWabaCallback(wabaId) {
  const accessToken = process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_SYSTEM_TOKEN;
  if (!accessToken) {
    console.error("❌ Error: META_ACCESS_TOKEN environment variable is not set.");
    console.error("   Please set it in your environment before running this script:");
    console.error('   $env:META_ACCESS_TOKEN="<your_token>" (PowerShell) or export META_ACCESS_TOKEN="<your_token>" (Bash)');
    console.error("   Never pass access tokens as CLI arguments.");
    process.exit(1);
  }

  if (!wabaId) {
    console.error("Usage: node scripts/verify-waba-callback.mjs <waba_id>");
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
      console.error(`❌ Meta Graph API returned HTTP ${res.status}.`);
      process.exit(1);
    }

    const json = await res.json();
    const apps = json.data || [];
    let matched = false;
    for (const app of apps) {
      const callback = app.whatsapp_business_api_data?.override_callback_uri;
      if (callback === EXPECTED_CALLBACK_URL) {
        console.log(`✅ MATCH: WABA ${wabaId} override_callback_uri is verified:`);
        console.log(`   ${callback}`);
        matched = true;
      } else if (callback) {
        console.warn(`⚠️ Warning: override_callback_uri points to another target (Expected: ${EXPECTED_CALLBACK_URL})`);
      }
    }

    if (!matched) {
      console.error(`❌ No subscribed app on WABA ${wabaId} points to ${EXPECTED_CALLBACK_URL}`);
      process.exit(1);
    }

    console.log("🎉 Staging WABA callback override verification PASSED.");
  } catch {
    console.error("Network or verification error encountered during check.");
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.length > 1) {
  console.error("❌ Error: Access tokens must never be passed in command arguments.");
  console.error("   Set the META_ACCESS_TOKEN environment variable instead.");
  console.error("   Usage: node scripts/verify-waba-callback.mjs <waba_id>");
  process.exit(1);
}

const [wabaId] = args;
if (wabaId) {
  verifyWabaCallback(wabaId);
} else {
  console.log("Usage: node scripts/verify-waba-callback.mjs <waba_id>");
  console.log("Ensure META_ACCESS_TOKEN is set in your environment.");
}
