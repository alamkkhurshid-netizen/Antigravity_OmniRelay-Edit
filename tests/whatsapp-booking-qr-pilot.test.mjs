import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const share=readFileSync(new URL("../app/app/appointments/booking-share.tsx",import.meta.url),"utf8");
const appointments=readFileSync(new URL("../app/app/appointments/page.tsx",import.meta.url),"utf8");

test("branded booking QR starts the clinic WhatsApp booking concierge",()=>{
  assert.match(share,/https:\/\/wa\.me\/\$\{digits\}/);
  assert.match(share,/BOOK APPOINTMENT/);
  assert.match(share,/Use WhatsApp only after the acceptance gate is active/);
  assert.match(share,/createFramedQr/);
  assert.match(share,/businessName/);
  assert.match(share,/themeFor/);
});

test("WhatsApp QR uses only the tenant live channel connection",()=>{
  assert.match(appointments,/channel_connections/);
  assert.match(appointments,/eq\("organization_id",organization\.id\)/);
  assert.match(appointments,/eq\("channel","whatsapp"\)/);
  assert.match(appointments,/eq\("status","live"\)/);
  assert.match(appointments,/whatsappNumber=\{whatsappConnection\?\.display_address/);
});

test("web booking remains an explicit fallback",()=>{
  assert.match(share,/mode === "web"/);
  assert.match(share,/Web booking/);
  assert.match(share,/patients who cannot complete booking in WhatsApp/);
});
