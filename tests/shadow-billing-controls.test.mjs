import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root=new URL("../",import.meta.url);
const read=(path)=>readFile(new URL(path,root),"utf8");
test("shadow billing controls remain disabled and auditable",async()=>{const migration=await read("supabase/migrations/20260913010000_shadow_billing_controls_foundation.sql");for(const table of ["operational_topup_intents","operational_statements","operational_rate_card_audit","operational_creative_reservations","operational_reconciliation_runs"])assert.match(migration,new RegExp(`create table if not exists public\\.${table}`));assert.match(migration,/wallet_topups_enabled = false/);assert.match(migration,/creative_billing_enabled = false/);assert.match(migration,/rate_activation_enabled = false/);assert.match(migration,/values\(p_channel,p_country,p_category,p_rate,0,'INR',p_source_url,p_source_version,now\(\),false,'draft'\)/);});
test("billing workspace provides shadow analytics and export",async()=>{const page=await read("app/app/billing/page.tsx");const controls=await read("app/app/billing/billing-controls.tsx");assert.match(page,/BillingControls/);assert.match(controls,/Export CSV statement/);assert.match(controls,/Reserve → capture → release/);assert.match(controls,/Three-way monthly comparison/);});
