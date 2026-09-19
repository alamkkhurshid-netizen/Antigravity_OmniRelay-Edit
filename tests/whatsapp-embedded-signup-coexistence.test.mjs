import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root=new URL("../",import.meta.url);

test("embedded signup records the exact Meta onboarding mode",async()=>{
  const route=await readFile(new URL("app/api/whatsapp/embedded-signup/route.ts",root),"utf8");
  assert.match(route,/allowedFlowTypes/);
  assert.match(route,/coexistence: payload\.flowType === "existing_phone_number"/);
  assert.match(route,/onboarding_mode: payload\.flowType/);
});

test("clinic onboarding recommends coexistence without promising eligibility",async()=>{
  const connect=await readFile(new URL("app/app/integrations/whatsapp-connect.tsx",root),"utf8");
  const page=await readFile(new URL("app/app/integrations/page.tsx",root),"utf8");
  assert.match(connect,/Recommended: keep the existing WhatsApp Business app through Meta Coexistence/);
  assert.match(page,/Where Meta marks it eligible/);
  assert.match(page,/will never silently migrate or replace that number/);
  assert.match(page,/New spare SIM/);
});

test("only the workspace owner can create or complete a Meta connection",async()=>{
  const session=await readFile(new URL("app/api/whatsapp/onboarding-session/route.ts",root),"utf8");
  const finalize=await readFile(new URL("app/api/whatsapp/embedded-signup/route.ts",root),"utf8");
  assert.match(session,/Only the workspace owner can connect WhatsApp Business/);
  assert.match(finalize,/Only the workspace owner can complete WhatsApp Business connection/);
});

test("Meta popup opens in the original click gesture",async()=>{
  const connect=await readFile(new URL("app/app/integrations/whatsapp-connect.tsx",root),"utf8");
  assert.match(connect,/window\.FB\.login\(\(response\) => \{[\s\S]*void completeMetaLogin\(response\)/, "Meta must receive a plain callback inside the original click gesture");
  assert.match(connect,/async function completeMetaLogin[\s\S]*fetch\("\/api\/whatsapp\/onboarding-session"/, "the server session is created only after Meta returns a response");
  assert.match(connect,/Meta did not open its secure connection window/);
  assert.match(connect,/No WhatsApp account was changed/);
  assert.match(connect,/Meta Embedded Signup launch failed/);
  assert.match(connect,/window\.FB\.login\(\(response\)/);
  assert.doesNotMatch(connect,/window\.FB\.login\(async/);
});
