import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("OmniRelay Guide keeps CTO-style page help separate from tenant data", async () => {
  const [knowledge, route, panel, shell] = await Promise.all([
    readFile(new URL("lib/omni-relay-guide.ts", root), "utf8"),
    readFile(new URL("app/api/omni-relay-guide/route.ts", root), "utf8"),
    readFile(new URL("components/omni-relay-guide.tsx", root), "utf8"),
    readFile(new URL("components/app-shell.tsx", root), "utf8"),
  ]);
  for (const routeName of ["/app", "/app/action-centre", "/app/conversations", "/app/contacts", "/app/care-plans", "/app/team", "/app/appointments", "/app/clinic-operations", "/app/booking-concierge", "/app/agents", "/app/automations", "/app/campaigns", "/app/operations", "/app/readiness", "/app/integrations", "/app/activity", "/app/billing", "/app/settings"]) assert.match(knowledge, new RegExp(routeName.replaceAll("/", "\\/")));
  assert.match(knowledge, /practical CTO-style product advisor/i);
  assert.match(knowledge, /I don't have verified OmniRelay guidance for that/i);
  assert.match(knowledge, /therasynergybiomedex@gmail\.com/);
  assert.match(route, /GEMINI_API_KEY/);
  assert.match(route, /streamGenerateContent\?alt=sse/);
  assert.match(route, /x-goog-api-key/);
  assert.match(route, /split\(\/\\r\?\\n\\r\?\\n\/\)/);
  assert.match(route, /emitEvents\(controller, true\)/);
  assert.match(route, /guideContextForConversation/);
  assert.match(route, /slice\(-6\)/);
  assert.match(route, /maxOutputTokens: 420/);
  assert.match(knowledge, /CONCRETE OMNIRELAY EXAMPLES/);
  assert.match(knowledge, /planned pilot start date/i);
  assert.match(knowledge, /Verified OmniRelay product catalogue/);
  assert.match(knowledge, /Notifications and daily attention/);
  assert.match(knowledge, /Safe first-time clinic setup/);
  assert.match(knowledge, /Guide safety and answer boundaries/);
  assert.match(knowledge, /slice\(0, 3\)/);
  assert.match(knowledge, /Never substitute a generic online-booking story/);
  assert.doesNotMatch(route, /\.from\(/);
  assert.match(panel, /getReader\(\)/);
  assert.match(panel, /context\.suggestions/);
  assert.match(panel, /Email support/);
  assert.match(panel, /Practical help, in context/);
  assert.match(panel, /Verified product help/);
  assert.match(panel, /Do not enter patient, customer, payment or secret data/);
  assert.match(shell, /<OmniRelayGuide \/>/);
});
