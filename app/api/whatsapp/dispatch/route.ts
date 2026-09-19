import { NextResponse } from "next/server";

/**
 * Appointment reminders are dispatched exclusively by the Supabase
 * appointment-reminder-dispatch Edge Function. It atomically claims work,
 * re-checks care-communication consent and uses recoverable leases.
 *
 * Keep this retired route as an explicit tombstone so an old scheduler or
 * integration cannot silently re-enable the former non-atomic sender.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Retired endpoint",
      replacement: "appointment-reminder-dispatch",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
