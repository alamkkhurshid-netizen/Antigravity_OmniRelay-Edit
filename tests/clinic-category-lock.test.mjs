import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("migration enforces exclusive Clinic & Healthcare category and single-profile invariant", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/20260918214500_enforce_single_clinic_profile_lock.sql", root),
    "utf8"
  );

  // Rejects non-healthcare categories at the database level
  assert.match(migration, /p_business_category <> 'Healthcare'/);
  assert.match(migration, /Only Clinic & Healthcare practices are permitted/i);

  // Prevents multiple business profiles per user email/account
  assert.match(migration, /select 1 from public\.agents/);
  assert.match(migration, /user_id = current_user_id and not ai/);
  assert.match(migration, /Each user account is strictly limited to one clinic profile/i);

  // Requires authenticated caller
  assert.match(migration, /current_user_id is null/);
});

test("onboarding page redirects users who already belong to a clinic workspace to /app", async () => {
  const page = await readFile(new URL("app/onboarding/page.tsx", root), "utf8");

  assert.match(page, /from\("agents"\)/);
  assert.match(page, /existingAgent\?\.organization_id/);
  assert.match(page, /redirect\("\/app"\)/);
});

test("onboarding form enforces Clinic & Healthcare exclusivity and double-confirmation checkboxes", async () => {
  const form = await readFile(new URL("app/onboarding/onboarding-form.tsx", root), "utf8");

  // Only Healthcare is active; other categories are waitlisted
  assert.match(form, /CLINIC & HEALTHCARE ONLY/);
  assert.match(form, /Waitlist/);
  assert.match(form, /Active CRM/);

  // Double-confirmation gate checkboxes
  assert.match(form, /DOUBLE-CONFIRMATION & PERMANENT PROFILE LOCK/);
  assert.match(form, /confirmHealthcare/);
  assert.match(form, /confirmSingleProfile/);
  assert.match(form, /I confirm this workspace is exclusively for a licensed clinic/);
  assert.match(form, /permanently locked to this single clinic profile/);

  // Form submission safeguards
  assert.match(form, /category !== "Healthcare"/);
  assert.match(form, /!confirmHealthcare \|\| !confirmSingleProfile/);
  assert.match(form, /p_business_category: "Healthcare"/);
});

test("dashboard layout ensures users without a workspace are directed to onboarding", async () => {
  const layout = await readFile(new URL("app/app/layout.tsx", root), "utf8");

  assert.match(layout, /!workspace\?\.organization_id && !isOperator/);
  assert.match(layout, /redirect\("\/onboarding"\)/);
});
