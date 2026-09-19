import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const workspace=await readFile(new URL("../app/app/settings/workspace-form.tsx",import.meta.url),"utf8");
const schedule=await readFile(new URL("../app/app/settings/chamber-schedule-editor.tsx",import.meta.url),"utf8");

test("business setup retains confirmed chamber and service records in the active form",()=>{
  assert.match(workspace,/business_locations[\s\S]*?\.select\(\)/);
  assert.match(workspace,/organization_services[\s\S]*?\.select\(\)/);
  assert.match(workspace,/setLocations\(savedLocations\)/);
  assert.match(workspace,/setServices\(savedServices\)/);
  assert.doesNotMatch(workspace,/window\.setTimeout\(\(\) => window\.location\.reload\(\), 700\)/);
});

test("chamber schedule only confirms success after the scheduling RPC returns an assignment",()=>{
  assert.match(schedule,/const \{data,error\}=await createClient\(\)\.rpc\("save_provider_chamber_schedule"/);
  assert.match(schedule,/if\(!data\) throw new Error\("The chamber schedule was not confirmed/);
  assert.match(schedule,/details remain on screen/);
  assert.doesNotMatch(schedule,/window\.setTimeout\(\(\)=>window\.location\.reload\(\),900\)/);
});
