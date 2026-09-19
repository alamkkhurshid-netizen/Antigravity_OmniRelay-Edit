import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260805173550_patient_profile_photos.sql", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/contacts/avatar/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/app/contacts/page.tsx", import.meta.url), "utf8");

test("patient photos use a private, bounded and tenant-scoped bucket", () => {
  assert.match(migration, /'patient-avatars'[\s\S]*false[\s\S]*2097152/);
  assert.match(migration, /private\.is_organization_member/);
  assert.match(migration, /image\/jpeg/);
  assert.match(migration, /image\/png/);
  assert.match(migration, /image\/webp/);
});

test("avatar writes verify the patient workspace and never expose a public URL", () => {
  assert.match(route, /eq\("organization_id", organization\.id\)/);
  assert.match(route, /createSignedUrl\(path, 3600\)/);
  assert.doesNotMatch(route, /getPublicUrl/);
  assert.match(route, /2 \* 1024 \* 1024/);
});

test("directory reads private photos through expiring signed links", () => {
  assert.match(page, /from\("patient-avatars"\)\.createSignedUrl/);
  assert.match(page, /avatar_url/);
});
