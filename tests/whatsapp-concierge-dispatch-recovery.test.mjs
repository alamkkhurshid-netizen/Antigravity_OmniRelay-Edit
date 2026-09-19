import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../supabase/migrations/20260815113000_whatsapp_concierge_dispatch_recovery.sql",
  import.meta.url,
);

test("WhatsApp concierge dispatch is durable, bounded and tenant visible", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /message_id uuid not null unique/i);
  assert.match(sql, /attempts between 0 and 3/i);
  assert.match(sql, /last_message_id = d\.message_id/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /status = 'exhausted'/i);
  assert.match(sql, /private\.is_organization_member\(organization_id, 'member'\)/i);
  assert.match(sql, /process-whatsapp-concierge-dispatches/i);
});

test("inbound trigger enqueues before dispatch and never blocks message ingestion", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /insert into public\.whatsapp_concierge_dispatches/i);
  assert.match(sql, /on conflict \(message_id\) do nothing/i);
  assert.match(sql, /perform private\.dispatch_whatsapp_concierge_job\(dispatch_id\)/i);
  assert.match(sql, /exception when others then\s+return new/i);
  assert.doesNotMatch(sql, /grant (?:all|insert|update|delete).*authenticated/i);
});

test("a later processed inbound message prevents replay of older menu choices", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260815114500_prevent_whatsapp_concierge_replay.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /processed_message\.id = s\.last_message_id/i);
  assert.match(sql, /processed_message\.created_at >= dispatched_message\.created_at/i);
  assert.match(sql, /processed_message\.conversation_id = d\.conversation_id/i);
  assert.match(sql, /dispatched_message\.conversation_id = d\.conversation_id/i);
  assert.match(sql, /status = 'processed'/i);
});
