import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20260824030000_deduplicate_doctor_shift_notifications.sql",import.meta.url),"utf8");

test("automatic doctor queue groups same-provider same-start rules",()=>{
  assert.match(migration,/partition by r\.organization_id,r\.resource_id/);
  assert.match(migration,/r\.location_id is not null/);
  assert.match(migration,/r\.shift_rank=1/);
  assert.match(migration,/existing\.shift_starts_at=r\.shift_at/);
});

test("deduplication remains service-only and preserves delivery evidence",()=>{
  assert.match(migration,/revoke all on function public\.materialize_due_doctor_queue_dispatches\(timestamptz\) from public,anon,authenticated/);
  assert.match(migration,/grant execute on function public\.materialize_due_doctor_queue_dispatches\(timestamptz\) to service_role/);
  assert.doesNotMatch(migration,/delete from public\.doctor_queue_dispatches|update public\.doctor_queue_dispatches/);
});
