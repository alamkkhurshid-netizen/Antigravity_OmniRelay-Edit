# OmniRelay Edge Functions Architecture & Ownership Map (S2-06)

**Audited:** 2026-10-18  
**Scope:** `supabase/functions/` directory  
**Security Posture:** Deny-by-default; service-role enforcement; master killswitch guarded (`WORKER_ENABLED`).

---

## 1. Edge Function Inventory & Classification

| Function Name | Operational Role | Invocation Trigger | Authorization Boundary | Active Callers | Status |
|---|---|---|---|---|---|
| `whatsapp-booking-concierge` | Interactive 2-way patient conversational booking concierge | Inbound Meta Webhook / Queue Worker | Service Role / Meta App Secret HMAC | Meta Webhooks, Inbound queue runner | **Active Core** |
| `appointment-reminder-dispatch` | Outbound scheduled appointment notifications & confirmations | Cron / Lease Worker (`claim_due_appointment_reminders`) | Service Role Only | Scheduled Cron (`/api/cron/reminders`) | **Active Core** |
| `care-reminder-dispatch` | Chronic & post-consultation care plan reminders | Cron / Atomic Lease (`claim_due_care_reminder_runs`) | Service Role Only | Scheduled Cron / Care Plan Engine | **Active Core** |
| `campaign-dispatch` | Safe bulk audience broadcast with doctor scoping | Manual Dispatch / Campaign Queue | Service Role Only | `app/api/campaigns/route.ts` | **Active Core** |
| `doctor-queue-dispatch` | Live OPD patient queue advancement & doctor call alerts | OPD Token Advancement Trigger | Service Role Only | `app/api/queue/advance` / Staff Action Queue | **Active Core** |
| `whatsapp-template-audit` | Audits and syncs approved WhatsApp Business templates | Nightly Sync / Admin UI Action | Service Role Only | Admin Settings / Cron | **Active Core** |
| `automation-runner` | Visual builder and XYFlow logic node evaluator | Event Bus (`app_events`) | Service Role Only | Flow Trigger Event Listener | **Active** |
| `google-calendar-sync` | 2-way doctor consultation synchronization with Google Calendar | Doctor Calendar Update Hook | Bearer (OAuth User Context) | `lib/google-calendar.ts` | **Active** |
| `device-push-dispatch` | WebPush / PWA alert dispatch to doctor & clinic staff devices | High-priority notification trigger | Service Role Only | `lib/push-notifications.ts` | **Active** |
| `device-push-config` | Public VAPID key exchange & device subscription registration | Client PWA Handshake | Authenticated User (`auth.uid()`) | `components/pwa-registry.tsx` | **Active** |
| `deposit-acceptance-dispatch` | ₹1 synthetic booking deposit test harness & channel verification | Acceptance Runner | Service Role Only | `tests/deposit-acceptance-*` | **Test/Verification** |

---

## 2. Invariant & Security Safeguards

1. **Master & Granular Killswitch Invariants:**
   All 11 edge workers check `app_system_switches` before executing dispatch payloads:
   ```ts
   if (!isWorkerEnabled("WORKER_ENABLED") || !isWorkerEnabled(WORKER_KEY)) {
     // Preserves message in queue with zero data loss, fails closed without dispatch
     return new Response(JSON.stringify({ status: "paused", preserved: true }), { status: 200 });
   }
   ```
2. **Lease Locking & Atomic Concurrency:**
   Worker loops employ `FOR UPDATE SKIP LOCKED` atomic RPCs (`claim_due_care_reminder_runs`, `claim_due_appointment_reminders`) to eliminate race conditions across distributed serverless invocations.
3. **No Direct Secret Exposure:**
   Neither the public client nor anon key has access to trigger direct dispatch. Only server-mediated API routes or internal Postgres pg_cron triggers invoke these workers.
