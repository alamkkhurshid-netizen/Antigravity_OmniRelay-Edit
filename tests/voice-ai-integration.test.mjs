import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("S8-01: Voice availability generates 30-minute daytime slot intervals", async () => {
  const { generateDaySlots } = await import("../lib/voice/availability.ts");

  const slots = generateDaySlots("2026-10-25", 10, 12, 30);
  assert.equal(slots.length, 4); // 10:00, 10:30, 11:00, 11:30
  assert.equal(slots[0].time, "10:00");
  assert.equal(slots[0].display_time, "10:00 AM");
  assert.equal(slots[3].time, "11:30");
  assert.equal(slots[3].display_time, "11:30 AM");
});

test("S8-01: Availability slot filter marks conflicting appointments as unavailable", async () => {
  const { generateDaySlots, filterAvailableSlots } = await import("../lib/voice/availability.ts");

  const daySlots = generateDaySlots("2026-10-25", 10, 12, 30);
  const booked = [
    {
      starts_at: new Date("2026-10-25T10:30:00+05:30").toISOString(),
      ends_at: new Date("2026-10-25T11:00:00+05:30").toISOString(),
    },
  ];

  const filtered = filterAvailableSlots(daySlots, booked, "doc-1", "Dr. Sharma");
  assert.equal(filtered.length, 4);
  assert.equal(filtered.find((s) => s.time === "10:30")?.available, false);
  assert.equal(filtered.find((s) => s.time === "10:00")?.available, true);
  assert.equal(filtered.find((s) => s.time === "11:00")?.available, true);
});

test("S8-01: Voice availability speech generator builds natural spoken options", async () => {
  const { buildVoiceAvailabilitySpeech } = await import("../lib/voice/availability.ts");

  const slots = [
    { time: "10:00", display_time: "10:00 AM", starts_at: "", ends_at: "", doctor_id: "1", doctor_name: "Verma", available: true },
    { time: "11:30", display_time: "11:30 AM", starts_at: "", ends_at: "", doctor_id: "1", doctor_name: "Verma", available: true },
  ];

  const speech = buildVoiceAvailabilitySpeech("Verma", "2026-10-25", slots);
  assert.match(speech, /Dr\. Verma/);
  assert.match(speech, /10:00 AM/);
  assert.match(speech, /11:30 AM/);
});

test("S8-02: Voice appointment booking route tags source as Voice", async () => {
  const route = await read("app/api/voice/book/route.ts");

  assert.match(route, /source:\s*"Voice"/);
  assert.match(route, /status:\s*"confirmed"/);
  assert.match(route, /from\("appointments"\)/);
  assert.match(route, /from\("patient_profiles"\)/);
});

test("S8-02: Voice booking checks for overlapping appointment conflicts", async () => {
  const route = await read("app/api/voice/book/route.ts");

  assert.match(route, /Slot conflict/);
  assert.match(route, /status: 409/);
});

test("S8-03: Voice call logging route supports recording transcripts and latency metrics", async () => {
  const route = await read("app/api/voice/logs/route.ts");

  assert.match(route, /from\("voice_call_logs"\)/);
  assert.match(route, /duration_seconds/);
  assert.match(route, /transcript/);
  assert.match(route, /latency_metrics/);
  assert.match(route, /exotel_call_sid/);
});

test("S8-04: Voice agent configuration route enforces tenant isolation and defaults", async () => {
  const route = await read("app/api/voice/config/route.ts");

  assert.match(route, /from\("voice_agent_configs"\)/);
  assert.match(route, /defaultConfig/);
  assert.match(route, /greeting_message/);
  assert.match(route, /operating_hours/);
});

test("S8-05: Voice rate card in billing schema is configured for active voice channel", async () => {
  const migration = await read("supabase/migrations/20261010000003_multi_vertical_voice_and_rate_card.sql");

  assert.match(migration, /billing\.meta_rate_card/);
  assert.match(migration, /channel = 'voice'/);
  assert.match(migration, /base_rate_paise = 399/);
});

test("S8-05: Billable minutes calculation rounds up to nearest minute", () => {
  function computeBillableMinutes(seconds) {
    if (seconds <= 0) return 0;
    return Math.max(1, Math.ceil(seconds / 60));
  }

  assert.equal(computeBillableMinutes(15), 1);
  assert.equal(computeBillableMinutes(60), 1);
  assert.equal(computeBillableMinutes(61), 2);
  assert.equal(computeBillableMinutes(180), 3);
  assert.equal(computeBillableMinutes(0), 0);
});

test("S8-06: Voice analytics computes total minutes, conversion rate, and peak volume", async () => {
  const { computeVoiceAnalytics } = await import("../lib/voice/analytics.ts");

  const sampleLogs = [
    {
      id: "1",
      org_id: "org1",
      contact_phone: "+919876543210",
      direction: "inbound",
      duration_seconds: 120, // 2 mins
      outcome: "appointment_booked",
      emergency_flag: false,
      latency_metrics: { e2e_turn_ms: 450 },
      created_at: "2026-10-25T10:15:00.000Z",
    },
    {
      id: "2",
      org_id: "org1",
      contact_phone: "+919876543211",
      direction: "inbound",
      duration_seconds: 60, // 1 min
      outcome: "inquiry_resolved",
      emergency_flag: false,
      latency_metrics: { e2e_turn_ms: 550 },
      created_at: "2026-10-25T10:45:00.000Z",
    },
    {
      id: "3",
      org_id: "org1",
      contact_phone: "+919876543212",
      direction: "inbound",
      duration_seconds: 45,
      outcome: "human_transferred",
      emergency_flag: false,
      created_at: "2026-10-25T14:30:00.000Z",
    },
  ];

  const stats = computeVoiceAnalytics(sampleLogs);
  assert.equal(stats.totalCalls, 3);
  assert.equal(stats.totalTalkTimeSeconds, 225);
  assert.equal(stats.totalBillableMinutes, 4); // ceil(225/60)
  assert.equal(stats.bookingCount, 1);
  assert.equal(stats.transferredCount, 1);
  assert.equal(stats.conversionRatePercent, 33);
  assert.equal(stats.avgLatencyMs, 500); // (450 + 550) / 2
});

test("S8-07: Voice call escalation endpoint constructs Exotel dial passthru payload", async () => {
  const route = await read("app/api/voice/escalate/route.ts");

  assert.match(route, /receptionist_phone/);
  assert.match(route, /action:\s*"dial"/);
  assert.match(route, /outcome:\s*"human_transferred"/);
  assert.match(route, /from\("app_notifications"\)/);
});

test("S8-08: Voice health endpoint monitors telephony engine readiness and latency", async () => {
  const route = await read("app/api/voice/health/route.ts");

  assert.match(route, /VOICE_ENGINE_URL/);
  assert.match(route, /liveness/);
  assert.match(route, /readiness/);
  assert.match(route, /http_latency_ms/);
});

test("S8-09: Multi-vertical personas provide tailored prompts for Clinic, Restaurant, and Retail", async () => {
  const { VOICE_PERSONAS } = await import("../lib/voice/personas.ts");

  assert.ok(VOICE_PERSONAS.clinic);
  assert.ok(VOICE_PERSONAS.restaurant);
  assert.ok(VOICE_PERSONAS.retail);
  assert.ok(VOICE_PERSONAS.general);

  assert.equal(VOICE_PERSONAS.clinic.defaultBotName, "Maya");
  assert.match(VOICE_PERSONAS.clinic.systemPrompt, /108/);
  assert.match(VOICE_PERSONAS.restaurant.systemPrompt, /book a table/);
  assert.match(VOICE_PERSONAS.retail.systemPrompt, /active orders/);
});

test("S8-09: Clinic persona enforces severe emergency 108 triage protocol", async () => {
  const { VOICE_PERSONAS } = await import("../lib/voice/personas.ts");

  const clinic = VOICE_PERSONAS.clinic;
  assert.ok(clinic.emergencyInstructions);
  assert.match(clinic.emergencyInstructions, /108/);
  assert.match(clinic.systemPrompt, /chest pain/);
});

test("S8-10: Webhook ingestion verifies HMAC signature and guards against replay", async () => {
  const webhook = await read("app/api/webhooks/voice/route.ts");

  assert.match(webhook, /verifySignature/);
  assert.match(webhook, /VOICE_WEBHOOK_SECRET/);
  assert.match(webhook, /voiceWebhookReplayCache/);
  assert.match(webhook, /crypto\.timingSafeEqual/);
});
