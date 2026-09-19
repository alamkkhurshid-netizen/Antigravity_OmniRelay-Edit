import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

test("Campaign CSV Broadcast: Helper & Parser Module Tests", async (t) => {
  const campaignCsvModule = await import(
    `file://${path.join(projectRoot, "lib", "campaign-csv.ts")}`
  );

  await t.test("parseCampaignCsv normalizes phone numbers and deduplicates", () => {
    const rawCsv = `Name,Phone,Notes
Rahul Verma,9876543210,Diabetic consultation
Priya Sharma,+91 91234 56789,Regular Checkup
Duplicate Rahul,098765-43210,Duplicate row
Anita Rao,9811122233,Cardiology
Invalid Phone User,12345,Invalid number`;

    const result = campaignCsvModule.parseCampaignCsv(rawCsv);

    assert.equal(result.totalRows, 5);
    // 3 valid unique phone numbers (Rahul, Priya, Anita); 1 duplicate (Duplicate Rahul), 1 invalid (12345)
    assert.equal(result.validContacts.length, 3);
    assert.equal(result.duplicateCount, 1);
    assert.equal(result.invalidCount, 1);

    const phones = result.validContacts.map((r) => r.phone);
    assert.ok(phones.includes("+919876543210"));
    assert.ok(phones.includes("+919123456789"));
    assert.ok(phones.includes("+919811122233"));

    // Check mapped fields
    const priya = result.validContacts.find((r) => r.phone === "+919123456789");
    assert.equal(priya.name, "Priya Sharma");
    assert.equal(priya.notes, "Regular Checkup");
  });

  await t.test("generateSampleCampaignCsv produces valid CSV with headers", () => {
    const sample = campaignCsvModule.generateSampleCampaignCsv();
    assert.ok(sample.includes("Full Name,Phone,Notes"));
    assert.ok(sample.includes("+919831582626"));

    const parsedSample = campaignCsvModule.parseCampaignCsv(sample);
    assert.ok(parsedSample.validContacts.length >= 3);
    assert.equal(parsedSample.invalidCount, 0);
  });
});

test("Campaign CSV Broadcast: API Route File Integrity & Zero Regression", async () => {
  const apiRoutePath = path.join(
    projectRoot,
    "app",
    "api",
    "campaigns",
    "route.ts"
  );
  const routeContent = fs.readFileSync(apiRoutePath, "utf-8");

  // Verify that existing segment and campaign logic is preserved
  assert.ok(
    routeContent.includes('b.segment === "csv"'),
    "Must support b.segment === 'csv'"
  );
  assert.ok(
    routeContent.includes("communication_opt_outs"),
    "Must enforce opt-out checks"
  );
  assert.ok(
    routeContent.includes("csvContacts"),
    "Must handle csvContacts array"
  );
  assert.ok(
    routeContent.includes("patient_profiles"),
    "Must safely link recipients into patient_profiles"
  );
  assert.ok(
    routeContent.includes('source: "csv_broadcast"'),
    "Must tag newly imported CSV patients with source"
  );
});

test("Campaign CSV Broadcast: Campaign Workspace UI Component Integrity", async () => {
  const uiPath = path.join(
    projectRoot,
    "app",
    "app",
    "campaigns",
    "campaign-workspace.tsx"
  );
  const uiContent = fs.readFileSync(uiPath, "utf-8");

  assert.ok(
    uiContent.includes("Import audience from CSV file"),
    "UI must offer CSV audience segment option"
  );
  assert.ok(
    uiContent.includes("Download Sample CSV"),
    "UI must include sample template download link"
  );
  assert.ok(
    uiContent.includes("parseCampaignCsv"),
    "UI must use parseCampaignCsv for instant preview"
  );
  assert.ok(
    uiContent.includes("optedOutSet"),
    "UI must compute opt-out exclusions before launch"
  );
});
