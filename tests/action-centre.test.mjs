import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("action centre deploys only consented due WhatsApp care actions", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260809203000_action_centre_batch.sql", root), "utf8");
  assert.match(migration, /patient\.care_communications_consent/);
  assert.match(migration, /run\.scheduled_for <= now\(\)/);
  assert.match(migration, /run\.channel = 'whatsapp'/);
  assert.match(migration, /run\.attempt_count < run\.max_attempts/);
  assert.match(migration, /private\.is_organization_member\(p_organization_id, 'admin'\)/);
  assert.match(migration, /enable row level security/);
});

test("action centre visibly separates routine actions from exceptions", async () => {
  const ui = await readFile(new URL("app/app/action-centre/workspace.tsx", root), "utf8");
  assert.match(ui, /Review & deploy/);
  assert.match(ui, /PRIORITIZED CLINIC QUEUE/);
  assert.match(ui, /clinical, consent or delivery exceptions are never batch-sent/i);
  assert.match(ui, /AUDIT TRAIL/);
  assert.match(ui, /Review & retry/);
  assert.match(ui, /updateTask\(item,"completed"\)/);
  assert.match(ui, /or-type-page/);
  assert.match(ui, /or-type-section/);
  assert.match(ui, /or-type-stat/);
  assert.match(ui, /<h2 className="or-type-section mt-2">Approvals, waitlists and exceptions<\/h2>/);
  assert.match(ui, /care_reminder/);
  assert.match(ui, /appointment_reminder/);
});

test("action centre escalates blocked clinic launch gates without messaging patients", async () => {
  const page = await readFile(new URL("app/app/action-centre/page.tsx", root), "utf8");
  const ui = await readFile(new URL("app/app/action-centre/workspace.tsx", root), "utf8");
  assert.match(page, /from\("production_readiness_checks"\)/);
  assert.match(page, /eq\("status", "blocked"\)/);
  assert.match(page, /readinessChecks=\{readinessChecks\?\?\[\]\}/);
  assert.match(ui, /Clinic launch gate blocked/);
  assert.match(ui, /href:"\/app\/readiness"/);
  assert.doesNotMatch(ui, /readinessChecks\.map[\s\S]{0,500}whatsapp/);
});

test("action centre makes a missing, held or stale clinic pilot decision an explicit launch hold", async () => {
  const [page, ui] = await Promise.all([
    readFile(new URL("app/app/action-centre/page.tsx", root), "utf8"),
    readFile(new URL("app/app/action-centre/workspace.tsx", root), "utf8"),
  ]);
  assert.match(page, /from\("clinic_pilot_controls"\)/);
  assert.match(page, /pilotControl=\{pilotControl\}/);
  assert.match(ui, /pilotControl\.health_status === "hold"/);
  assert.match(ui, /clinicDay\(pilotControl\.reviewed_at\) === clinicDay\(nowIso\)/);
  assert.match(ui, /Clinic pilot launch hold/);
  assert.match(ui, /Pilot GO decision needs renewal/);
  assert.match(ui, /Reconfirm the named owners and GO decision for today’s clinic day/);
  assert.match(ui, /Record the named pilot owner, rollback owner and daily GO\/HOLD decision/);
  assert.match(ui, /href:"\/app\/readiness"/);
  assert.doesNotMatch(ui, /pilotControl[\s\S]{0,600}fetch\("\/api\/whatsapp/);
});
