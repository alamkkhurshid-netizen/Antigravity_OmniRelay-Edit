import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("production readiness evidence is tenant-scoped and admin-controlled", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260810180000_clinic_production_readiness.sql", root), "utf8");
  assert.match(sql, /production_readiness_checks/);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.production_readiness_checks from public, anon/i);
  assert.match(sql, /private\.is_organization_member\(organization_id, 'admin'\)/);
  assert.match(sql, /updated_by = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /grant .* to anon/i);
});

test("go-live control room combines automatic and accountable manual gates", async () => {
  const [page, workspace, api, shell] = await Promise.all([
    readFile(new URL("app/app/readiness/page.tsx", root), "utf8"),
    readFile(new URL("app/app/readiness/readiness-workspace.tsx", root), "utf8"),
    readFile(new URL("app/api/readiness/route.ts", root), "utf8"),
    readFile(new URL("components/app-shell.tsx", root), "utf8"),
  ]);
  assert.match(page, /Production WhatsApp number/);
  assert.match(page, /Lifecycle templates/);
  assert.match(page, /Last-24-hour operations/);
  assert.match(workspace, /Encrypted data export/);
  assert.match(workspace, /Restore drill/);
  assert.match(workspace, /Clinic pilot sign-off/);
  assert.match(api, /allowedChecks/);
  assert.match(api, /Administrator access required/);
  assert.match(shell, /Go-live readiness/);
  assert.match(page, /production_readiness_updated/);
  assert.match(workspace, /EVIDENCE TIMELINE/);
});

test("all pilot lifecycle evidence keys accepted by the workspace are accepted by the database", async () => {
  const [workspace, api, migration] = await Promise.all([
    readFile(new URL("app/app/readiness/readiness-workspace.tsx", root), "utf8"),
    readFile(new URL("app/api/readiness/route.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20260830153000_expand_clinic_pilot_readiness_checks.sql", root), "utf8"),
  ]);

  for (const key of ["pilot_booking", "pilot_care_plan", "pilot_follow_up", "pilot_reminder"]) {
    assert.match(workspace, new RegExp(`key: "${key}"`));
    assert.match(api, new RegExp(`"${key}"`));
    assert.match(migration, new RegExp(`'${key}'`));
  }
});

test("final clinic pilot sign-off is server-gated by the six preceding evidence checks", async () => {
  const [workspace, api] = await Promise.all([
    readFile(new URL("app/app/readiness/readiness-workspace.tsx", root), "utf8"),
    readFile(new URL("app/api/readiness/route.ts", root), "utf8"),
  ]);
  assert.match(api, /const signoffPrerequisites = \["backup_export", "restore_drill", "pilot_booking", "pilot_care_plan", "pilot_follow_up", "pilot_reminder"\]/);
  assert.match(api, /checkKey === "pilot_signoff" && status === "ready"/);
  assert.match(api, /in\("check_key", signoffPrerequisites\)/);
  assert.match(api, /Complete the \$\{missing\.length\} remaining pilot evidence gate/);
  assert.match(workspace, /signoffBlocked/);
  assert.match(workspace, /Close the six preceding pilot evidence gates before final sign-off/);
  assert.match(workspace, /disabled=\{definition\.key === "pilot_signoff" && signoffBlocked\}/);
});

test("pilot operations control is tenant-scoped, admin-controlled, and contains no patient record", async () => {
  const [migration, route, page, control] = await Promise.all([
    readFile(new URL("supabase/migrations/20260901152000_clinic_pilot_controls.sql", root), "utf8"),
    readFile(new URL("app/api/readiness/pilot-control/route.ts", root), "utf8"),
    readFile(new URL("app/app/readiness/page.tsx", root), "utf8"),
    readFile(new URL("app/app/readiness/pilot-control.tsx", root), "utf8"),
  ]);

  assert.match(migration, /clinic_pilot_controls/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.clinic_pilot_controls from public, anon/i);
  assert.match(migration, /private\.is_organization_member\(organization_id, 'admin'\)/);
  assert.match(migration, /health_status in \('hold','go'\)/);
  assert.match(route, /clinic_pilot_controls/);
  assert.match(route, /Administrator access required/);
  assert.match(route, /recordTeamAudit/);
  assert.match(page, /clinic_pilot_controls/);
  assert.match(control, /Pilot owner/);
  assert.match(control, /Rollback owner/);
  assert.match(control, /Planned pilot start date/);
  assert.match(route, /plannedStartDate/);
  assert.match(control, /No patient or clinical details/);
});

test("pilot day closeout is administrator-only, audit-only, and excludes patient details", async () => {
  const [route, control, page] = await Promise.all([
    readFile(new URL("app/api/readiness/pilot-closeout/route.ts", root), "utf8"),
    readFile(new URL("app/app/readiness/pilot-closeout.tsx", root), "utf8"),
    readFile(new URL("app/app/readiness/page.tsx", root), "utf8"),
  ]);
  assert.match(route, /Administrator access required/);
  assert.match(route, /clinic_pilot_day_closed/);
  assert.match(route, /pilot_closeout_status/);
  assert.match(control, /Do not enter patient names, phone numbers, diagnoses, or message content/);
  assert.match(control, /Paused \/ rollback used/);
  assert.match(page, /clinic_pilot_day_closed/);
  assert.doesNotMatch(route, /from\("patients"\)|from\("appointments"\)|fetch\("\/api\/whatsapp/);
});
