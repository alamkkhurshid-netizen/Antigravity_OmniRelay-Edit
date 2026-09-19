import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(
  new URL(
    "../supabase/migrations/20260811081846_revoke_direct_trigger_function_execution.sql",
    import.meta.url,
  ),
  "utf8",
);

const protectedFunctions = [
  "private.invoke_whatsapp_booking_concierge()",
  "private.offer_released_appointment_slot()",
  "private.sync_care_reminder_run_from_message()",
  "private.sync_reminder_event_from_message()",
  "public.after_insert_on_organizations()",
  "public.dispatcher_edge_function()",
  "public.edge_function()",
  "public.lookup_agents_by_email_after_insert_on_auth_users()",
  "public.lookup_user_id_by_email_before_insert_on_agents()",
  "public.notify_webhook()",
  "public.rls_auto_enable()",
];

test("trigger functions are removed from direct Data API execution", () => {
  for (const functionName of protectedFunctions) {
    assert.match(
      sql,
      new RegExp(
        `revoke execute on function ${functionName.replace(/[().]/g, "\\$&")} from public, anon, authenticated;`,
        "i",
      ),
    );
  }
});
