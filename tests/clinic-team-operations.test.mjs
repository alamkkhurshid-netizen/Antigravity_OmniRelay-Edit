import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("team operations preserve tenant and recipient boundaries", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260808150000_clinic_team_operations.sql", root), "utf8");
  const hardening = await readFile(new URL("supabase/migrations/20260808151500_clinic_team_permission_hardening.sql", root), "utf8");
  assert.match(sql, /app_notifications.*enable row level security/is);
  assert.match(sql, /recipient_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /accept_workspace_invitations/);
  assert.match(hardening, /grant update \(read_at\)/i);
  assert.match(hardening, /assignees may only change task status/i);
});

test("staff invitations and role changes stay server mediated", async () => {
  const invitations = await readFile(new URL("app/api/team/invitations/route.ts", root), "utf8");
  const members = await readFile(new URL("app/api/team/members/route.ts", root), "utf8");
  const ui = await readFile(new URL("app/app/team/team-operations.tsx", root), "utf8");
  assert.match(invitations, /inviteUserByEmail/);
  assert.match(invitations, /actor\?\.extra\?\.role !== "owner"/);
  assert.match(members, /Only the workspace owner can change roles/);
  assert.match(ui, /One team, clear ownership/);
  assert.match(ui, /My tasks/);
});

