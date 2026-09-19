import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Meta inbound webhooks require an App Secret HMAC", async () => {
  const route = await readFile(new URL("app/api/whatsapp/webhook/route.ts", root), "utf8");
  assert.match(route, /x-hub-signature-256/);
  assert.match(route, /WHATSAPP_APP_SECRET/);
  assert.match(route, /HMAC/);
  assert.doesNotMatch(route, /validSignature\([^)]*SUPABASE/);
});

test("private operator and booking-access tables are deny-by-default", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260808210000_security_hardening.sql", root), "utf8");
  assert.match(migration, /alter table private\.platform_operators enable row level security/);
  assert.match(migration, /alter table private\.customer_booking_access enable row level security/);
  assert.match(migration, /revoke all on private\.platform_operators from public, anon, authenticated/);
  assert.match(migration, /revoke all on private\.customer_booking_access from public, anon, authenticated/);
});

test("patient portal links are exchanged once for HttpOnly sessions", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260808210000_security_hardening.sql", root), "utf8");
  const route = await readFile(new URL("app/api/patient/portal/route.ts", root), "utf8");
  const client = await readFile(new URL("app/patient/patient-portal.tsx", root), "utf8");
  assert.match(migration, /s\.consumed_at is null/);
  assert.match(migration, /for update/);
  assert.match(migration, /access_token_hash/);
  assert.match(route, /exchange_patient_portal_link/);
  assert.match(route, /httpOnly: true/);
  assert.match(route, /sameSite: "strict"/);
  assert.doesNotMatch(client, /JSON\.stringify\(\{token,/);
  assert.match(client, /history\.replaceState/);
});

test("medicine imports require a separate high-entropy server secret", async () => {
  const route = await readFile(new URL("app/api/internal/medicine-import/route.ts", root), "utf8");
  assert.match(route, /MEDICINE_IMPORT_SECRET/);
  assert.match(route, /expected\.length >= 32/);
  assert.match(route, /x-omni-import-secret/);
});
