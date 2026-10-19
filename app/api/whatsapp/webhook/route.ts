import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * DECOMMISSIONED: Next.js Inbound WhatsApp Webhook Tombstone
 *
 * Inbound WhatsApp webhook processing on this route has been permanently decommissioned
 * per CTO Direction. All inbound message ingestion, contact tracking, deduplication,
 * and delivery/read status reconciliations are canonically handled by the Supabase
 * Edge Function: `whatsapp-webhook`.
 *
 * DO NOT register this endpoint with Meta.
 */

const TOMBSTONE_PAYLOAD = {
  error: "Gone",
  message:
    "This webhook endpoint is retired. Canonical WhatsApp webhook traffic is handled exclusively by the Supabase 'whatsapp-webhook' Edge Function.",
  canonical_endpoint: "/functions/v1/whatsapp-webhook",
};

export async function GET() {
  return NextResponse.json(TOMBSTONE_PAYLOAD, { status: 410 });
}

export async function POST() {
  return NextResponse.json(TOMBSTONE_PAYLOAD, { status: 410 });
}
