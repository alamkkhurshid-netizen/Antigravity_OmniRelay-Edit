# Production security inventory

Baseline captured: 11 August 2026

This document reconciles the Clinic-first source repository with the connected
OmniRelay Supabase project and the current OmniRelay Site. It records the
production surface before security-hardening migrations are written.

## Deployment baseline

- Current Site version: 86
- Source commit: `82e1091d794647187fa6600d00c0ebd5d9132595`
- Site state: active and publicly reachable
- Supabase project state: active and healthy
- Database engine: PostgreSQL 17

## Reconciliation summary

| Surface | Source repository | Connected production | Reconciliation status |
| --- | ---: | ---: | --- |
| Migration files/history entries | 71 | 157 | 86 inherited migrations are not represented locally |
| Supabase Edge Functions | 4 | 22 active | 18 inherited functions are not represented locally |
| RLS-enabled public/private tables | Not previously inventoried | 82 | Live catalogue is authoritative |
| RLS-enabled tables with no policy | Not previously inventoried | 18 | Deny-by-default until each intended consumer is documented |
| Security-advisor notices | Not previously captured | 62 | Requires object-by-object triage |

The missing migration and function history predates the Clinic-first source
slices. It must not be recreated from memory. Existing production objects stay
in place until their callers, grants and rollback requirements are known.

## Active Edge Functions

Clinic-first functions represented in this repository:

- `appointment-reminder-dispatch`
- `campaign-dispatch`
- `care-reminder-dispatch`
- `whatsapp-booking-concierge`

Inherited production functions requiring ownership/use classification:

- `agent-client`
- `generic-dispatcher`
- `generic-webhook`
- `health`
- `instagram-dispatcher`
- `instagram-management`
- `instagram-webhook`
- `mcp`
- `media-preprocessor`
- `razorpay-webhook`
- `readiness`
- `storage-gc`
- `whatsapp-dispatcher`
- `whatsapp-management`
- `whatsapp-web-management`
- `whatsapp-webhook`
- `whatsapp-web-dispatcher`
- `whatsapp-web-webhook`

All 22 are currently active. Several intentionally disable platform JWT
verification because they implement webhook or worker authentication inside the
function; that decision must be verified per function, not changed globally.

## Active scheduled work

Production currently schedules:

- Atomic appointment-reminder dispatch every minute
- Care-reminder materialization and dispatch
- Campaign dispatch
- Pending outbound-message dispatch
- Waitlist-offer expiry
- Billing-notice materialization
- Media preprocessing
- Instagram-token refresh
- Storage garbage collection
- Job-run-detail retention

The former Next.js `/api/whatsapp/dispatch` route has no production cron caller.
It is retained only as an HTTP 410 tombstone so stale callers fail closed.

## Database advisor baseline

| Advisor category | Count | Treatment |
| --- | ---: | --- |
| RLS enabled with no policy | 18 | Confirm deny-by-default intent or add purpose-specific access |
| Mutable function search path | 0 | All identified functions now have fixed paths |
| Extension in public schema | 2 | Review relocation impact before changing |
| Anonymous execution of `SECURITY DEFINER` | 17 | Keep only intentional public RPCs; revoke internal/obsolete calls |
| Authenticated execution of `SECURITY DEFINER` | 24 | Retain only least-privilege application APIs |
| Leaked-password protection disabled | 1 | Enable through Auth configuration before real-patient pilot |

Some execution warnings overlap because one function can be callable by both
anonymous and authenticated roles. Counts are advisor findings, not confirmed
exploits.

### Applied hardening

Migration `revoke_direct_trigger_function_execution` revoked direct Data API
execution from 11 trigger-only functions while preserving explicit
`service_role` access. Live catalogue verification confirms all 11 remain bound
to their triggers, are unavailable to `anon` and `authenticated`, and remain
available to `service_role`. The advisor total decreased from 90 to 81; the
remaining findings require separate caller and authorization review.

Migration `harden_internal_security_definer_functions` narrows four additional
internal helpers. Webhook deduplication and conversation metering become
`service_role` only; permission and knowledge helpers are no longer anonymous.
The two backend helpers also receive immutable empty search paths. Public
booking, booking management and patient-portal functions are deliberately
unchanged in this slice. Live verification confirms the intended grants and a
new advisor sweep reports 68 notices, down from the original 90.

Migration `pin_remaining_function_search_paths` fixes the final six mutable
paths. The knowledge-vector function explicitly qualifies the vector distance
operator before receiving an empty path, preserving tenant-scoped RAG matching.
Live catalogue verification confirms all six paths are empty and fixed; the
security advisor now reports zero mutable-search-path findings and 62 notices
overall.

Migration `protect_public_booking_mutations` adds layered abuse protection at
the common appointment-insert boundary. Anonymous and ordinary authenticated
public bookings are limited to five successful booking mutations per contact
per hour and 60 per clinic per ten minutes. Contact keys are HMAC-pseudonymized
with an existing server secret; the limiter stores no raw phone, email or IP.
Service-role WhatsApp Concierge calls and database-internal clinic workflows
retain their existing path. Limiter rows are removed after seven days.

## Confirmed protected Clinic flows

- Appointment reminder cron calls `appointment-reminder-dispatch`.
- Reminder work is claimed by `claim_due_appointment_reminders` with
  `FOR UPDATE SKIP LOCKED` and a recoverable lease.
- The claim RPC is executable by `service_role` only.
- The Edge Function re-checks care-communication consent before delivery.
- Appointment completion is row-locked and idempotent.
- Canonical phone identity and the appointment lifecycle migrations are applied.
- Organisation creation has an active owner-membership trigger.

## Remediation gates

1. Do not revoke a function only because an advisor flags it. First identify its
   caller, authorization contract and rollback path.
2. Do not disable an inherited Edge Function until its webhook, cron and database
   dependencies are known.
3. Public booking and patient-portal functions must remain available while
   receiving explicit abuse controls.
4. Backup/restore evidence is required before permission-changing migrations or
   real patient data.
5. Every security migration must be reversible, tested against intended roles
   and followed by another live advisor sweep.
