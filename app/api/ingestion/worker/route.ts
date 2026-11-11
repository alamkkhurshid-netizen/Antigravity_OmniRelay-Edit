import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * DECOMMISSIONED: Mock Ingestion Worker Route
 *
 * This endpoint has been retired and deactivated.
 * Document ingestion and RAG vector processing are handled exclusively through
 * secure, authenticated background services with explicit tenant isolation.
 */
const TOMBSTONE_PAYLOAD = {
  error: "Gone",
  message: "This worker endpoint is permanently decommissioned.",
};

export async function GET() {
  return NextResponse.json(TOMBSTONE_PAYLOAD, {
    status: 410,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST() {
  return NextResponse.json(TOMBSTONE_PAYLOAD, {
    status: 410,
    headers: { "Cache-Control": "private, no-store" },
  });
}

