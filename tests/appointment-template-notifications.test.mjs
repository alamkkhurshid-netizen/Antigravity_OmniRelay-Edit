import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("system notifications engine reconciles bookings and approved templates", async () => {
  const [helper, route, layout, migration] = await Promise.all([
    readFile(new URL("lib/system-notifications.ts", root), "utf8"),
    readFile(new URL("app/api/notifications/route.ts", root), "utf8"),
    readFile(new URL("app/app/layout.tsx", root), "utf8"),
    readFile(new URL("supabase/migrations/20261122180000_appointment_and_template_notifications.sql", root), "utf8"),
  ]);

  // 1. Helper exports
  assert.match(helper, /export async function refreshSystemNotifications/);
  assert.match(helper, /export async function notifyAppointmentBooking/);
  assert.match(helper, /Meta WhatsApp Templates Approved/);
  assert.match(helper, /New Booking:/);
  assert.match(helper, /entity_type: "template_approval"/);
  assert.match(helper, /entity_type: "appointment"/);
  assert.match(helper, /href: "\/app\/appointments"/);
  assert.match(helper, /href: "\/app\/integrations"/);

  // 2. Notification API route integration
  assert.match(route, /refreshSystemNotifications\(organization\.id\)/);
  assert.match(route, /refreshAutomationWorkerAlerts\(organization\.id\)/);

  // 3. Layout integration
  assert.match(layout, /refreshSystemNotifications\(organization\.id\)/);

  // 4. Database migration triggers and functions
  assert.match(migration, /create or replace function private\.notify_appointment_booking\(\)/);
  assert.match(migration, /after insert on public\.appointments/);
  assert.match(migration, /Meta WhatsApp Templates Approved/);
  assert.match(migration, /refresh_priority_action_alerts/);
});
