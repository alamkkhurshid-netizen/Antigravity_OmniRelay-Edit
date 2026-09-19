import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const brochure = readFileSync("app/book/[slug]/brochure/route.ts", "utf8");

test("public clinic brochure is generated only from public booking information", () => {
  assert.match(brochure, /get_public_booking_page/);
  assert.match(brochure, /content-type.*application\/pdf/);
  assert.match(brochure, /data\.resources/);
  assert.match(brochure, /data\.locations/);
  assert.doesNotMatch(brochure, /from\("(patient_profiles|appointments|prescriptions)"\)/i);
});

test("clinic-approved custom brochures are preferred without exposing patient data", () => {
  assert.match(brochure, /custom_brochure_url/);
  assert.match(brochure, /custom_brochure_storage_path/);
  assert.match(brochure, /createSignedUrl/);
  assert.match(brochure, /google_maps_url/);
});
