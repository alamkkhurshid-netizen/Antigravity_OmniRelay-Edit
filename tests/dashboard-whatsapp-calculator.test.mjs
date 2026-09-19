import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("dashboard provides a user-friendly WABA Calc popup", async () => {
  const calculator = await read("components/whatsapp-cost-calculator.tsx");
  assert.match(calculator, /WABA Calc/);
  assert.match(calculator, /Patients per doctor \/ day/);
  assert.match(calculator, /Doctors available/);
  assert.match(calculator, /Marketing audience/);
  assert.match(calculator, /26 working days/);
  assert.match(calculator, /Planning rate card/);
  assert.match(calculator, /Add continued-care messages/);
  assert.match(calculator, /Follow-up patients/);
  assert.match(calculator, /Medication reminders/);
  assert.match(calculator, /CircleHelp/);
  assert.match(calculator, /patientsPerDay\*doctors\*WORKING_DAYS/);
  const shell = await read("components/app-shell.tsx");
  assert.match(shell, /WhatsAppCostCalculator rates=\{whatsappRates\} variant="header"/);
});

test("published rate cards are readable but not writable by workspace users", async () => {
  const migration = await read("supabase/migrations/20260912232000_allow_verified_rate_card_reads.sql");
  assert.match(migration, /grant select on public\.whatsapp_rate_cards to authenticated/);
  assert.match(migration, /for select to authenticated using \(active\)/);
  assert.doesNotMatch(migration, /grant insert|grant update|grant delete/);
});
