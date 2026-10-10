import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const form = await readFile(new URL("../app/app/settings/workspace-form.tsx", import.meta.url), "utf8");
const editor = await readFile(new URL("../components/settings/provider-identity-editor.tsx", import.meta.url), "utf8");
const hook = await readFile(new URL("../app/app/settings/use-workspace-settings.ts", import.meta.url), "utf8");
const source = form + "\n" + editor + "\n" + hook;

test("provider editor separates medical registration from WhatsApp contact",()=>{
  assert.match(source,/Medical registration number/);
  assert.match(source,/Doctor WhatsApp number/);
  assert.match(source,/Do not enter a phone number here/);
  assert.match(source,/contact_phone:\s*item\.contact_phone/);
});

test("all edited provider profiles are retained and saved independently",()=>{
  assert.match(source,/const \[providers, setProviders\]/);
  assert.match(source,/providers\.map\(\(item\)\s*=>\s*supabase\.from\("provider_profiles"\)\.upsert/);
  assert.match(source,/provider-specific settings/i);
});

test("WhatsApp contact requires international E.164-style input",()=>{
  assert.match(source,/validWhatsapp/);
  assert.match(source,/international format/);
  assert.match(source,/inputMode="tel"/);
});

test("provider details keep a stable responsive layout",async()=>{
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  assert.match(source,/className="provider-details"/);
  assert.match(source,/className="provider-main"/);
  assert.match(css,/\.provider-main\{[^}]*grid-template-columns:220px minmax\(0,1fr\)/);
  assert.match(css,/\.provider-fields input,\.provider-fields textarea\{width:100%;min-width:0\}/);
});
