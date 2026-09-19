#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const zipPath = process.argv.find((value) => value.endsWith(".zip"));
const dryRun = process.argv.includes("--dry-run");
if (!zipPath) {
  throw new Error("Usage: node scripts/import-medicine-catalog.mjs <flat-file-package.zip> [--dry-run]");
}

const packageBytes = readFileSync(zipPath);
const packageSha256 = createHash("sha256").update(packageBytes).digest("hex");
const prefix = "CommonDrugCodesForIndia_FlatFilePackage";
const readTable = (name) => {
  const text = execFileSync("unzip", ["-p", zipPath, `${prefix}/${name}.txt`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).replace(/^\uFEFF/, "");
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split("\t").map((value) => value.trim());
  return lines
    .filter((line) => line.trim())
    .map((line) =>
      Object.fromEntries(
        headers.map((header, index) => [header, (line.split("\t")[index] ?? "").trim()]),
      ),
    );
};

const brands = readTable("BrandMaster");
const generics = readTable("GenericMaster");
const products = new Map(readTable("ProductMaster").map((row) => [row.Identifier, row["Product Name"]]));
const suppliers = new Map(readTable("SupplierMaster").map((row) => [row.Identifier, row["Supplier Name"]]));
const forms = new Map(readTable("DrugFormMaster").map((row) => [row.Identifier, row["Dose Form"]]));
const routes = new Map(
  readTable("RouteOfAdministrationMaster").map((row) => [row.Identifier, row.RouteOfAdministration]),
);
const genericNames = new Map(generics.map((row) => [row.Identifier, row["Generic Name"]]));
const splitIdentifiers = (value) => value.split("+").map((item) => item.trim()).filter(Boolean);

const genericEntries = generics.map((row) => {
  const routeIds = splitIdentifiers(row["Route of Administration"]);
  const routeNames = routeIds.map((id) => routes.get(id)).filter(Boolean);
  const doseFormName = forms.get(row["Dose Form"]) ?? null;
  return {
    source_identifier: row.Identifier,
    entry_type: "generic",
    display_name: row["Generic Name"],
    generic_identifier: row.Identifier,
    generic_name: row["Generic Name"],
    product_identifier: null,
    product_name: null,
    supplier_identifier: null,
    supplier_name: null,
    dose_form_identifier: row["Dose Form"] || null,
    dose_form_name: doseFormName,
    route_identifiers: routeIds,
    route_names: routeNames,
    search_text: [row["Generic Name"], doseFormName, ...routeNames].filter(Boolean).join(" "),
    status: "active",
    quality_flags: [],
  };
});

const brandEntries = brands.map((row) => {
  const genericName = genericNames.get(row["Generic Identifier"]) ?? null;
  const productName = products.get(row["Product Identifier"]) ?? null;
  const supplierName = suppliers.get(row["Supplier Identifier"]) ?? null;
  const qualityFlags = [];
  if (!genericName) qualityFlags.push("missing_generic_reference");
  if (!productName) qualityFlags.push("missing_product_reference");
  if (!supplierName) qualityFlags.push("missing_supplier_reference");
  return {
    source_identifier: row.Identifier,
    entry_type: "brand",
    display_name: row["Brand Name"],
    generic_identifier: row["Generic Identifier"] || null,
    generic_name: genericName,
    product_identifier: row["Product Identifier"] || null,
    product_name: productName,
    supplier_identifier: row["Supplier Identifier"] || null,
    supplier_name: supplierName,
    dose_form_identifier: null,
    dose_form_name: null,
    route_identifiers: [],
    route_names: [],
    search_text: [row["Brand Name"], genericName, productName, supplierName]
      .filter(Boolean)
      .join(" "),
    status: qualityFlags.length ? "quarantined" : "active",
    quality_flags: qualityFlags,
  };
});

const entries = [...genericEntries, ...brandEntries];
const summary = {
  packageSha256,
  generics: genericEntries.length,
  brands: brandEntries.length,
  active: entries.filter((entry) => entry.status === "active").length,
  quarantined: entries.filter((entry) => entry.status === "quarantined").length,
};
console.log(JSON.stringify(summary, null, 2));
if (dryRun) process.exit(0);

const importUrl = process.env.OMNIRELAY_IMPORT_URL;
const importSecret = process.env.OMNIRELAY_IMPORT_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
if ((!importUrl || !importSecret) && (!supabaseUrl || !serviceKey)) {
  throw new Error(
    "Set OMNIRELAY_IMPORT_URL and OMNIRELAY_IMPORT_SECRET, or use direct Supabase operator credentials.",
  );
}
const postImport = async (payload) => {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(importUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-omni-import-secret": importSecret,
        },
        body: JSON.stringify(payload),
      });
      const body = await response.text();
      const result = JSON.parse(body);
      if (!response.ok) throw new Error(result.error ?? "Remote import failed.");
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
};
const releaseInput = {
      source_name: "Common Drug Codes for India",
      edition: "Flat File Package",
      release_date: "2026-06-15",
      package_sha256: packageSha256,
      licence_name: "Creative Commons Attribution 4.0 International",
      licence_url: "https://creativecommons.org/licenses/by/4.0/",
      status: "staged",
      row_counts: summary,
      metadata: {
        scope: "India",
        use: "prescription transcription assistance",
        attribution: "Common Drug Codes for India",
      },
    };
let releaseId;
let importedCount = 0;
let supabase;
if (importUrl && importSecret) {
  ({ releaseId, importedCount = 0 } = await postImport({ action: "stage", release: releaseInput }));
} else {
  supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: release, error: releaseError } = await supabase
    .from("medicine_catalog_releases")
    .upsert(releaseInput, { onConflict: "package_sha256" })
    .select("id")
    .single();
  if (releaseError || !release) throw releaseError ?? new Error("Release could not be staged.");
  releaseId = release.id;
  const { error: clearError } = await supabase
    .from("medicine_catalog_entries")
    .delete()
    .eq("release_id", releaseId);
  if (clearError) throw clearError;
}

const batchSize = 500;
for (let index = importedCount; index < entries.length; index += batchSize) {
  const batch = entries.slice(index, index + batchSize).map((entry) => ({
    ...entry,
  }));
  if (importUrl && importSecret) {
    await postImport({ action: "batch", releaseId, entries: batch });
  } else {
    const { error } = await supabase
      .from("medicine_catalog_entries")
      .insert(batch.map((entry) => ({ ...entry, release_id: releaseId })));
    if (error) throw new Error(`Import failed at row ${index}: ${error.message}`);
  }
  console.log(`Imported ${Math.min(index + batchSize, entries.length)} / ${entries.length}`);
}

if (importUrl && importSecret) {
  await postImport({ action: "activate", releaseId });
} else {
  const { error: activationError } = await supabase.rpc("activate_medicine_catalog_release", {
    p_release_id: releaseId,
  });
  if (activationError) throw activationError;
}
console.log(`Activated medicine catalogue release ${releaseId}.`);
