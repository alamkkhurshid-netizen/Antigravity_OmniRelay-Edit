# OmniRelay roadmap

## Phase 0 — Engineering foundation

Documentation, environment separation, CI/release discipline, backup and restore, security debt register, observability baseline and Aariv Impact Fund governance.

Delivered slices: safe operational error records, team-action throttling, reversible staff deactivation, immediate tenant-access revocation and append-only access auditing.

## Phase 1 — Clinic CRM and patient lifecycle

Reliable patient identity, household/guardian relationships, visit timeline, clinical notes boundaries, attachments, follow-up plans, consent, tasks and searchable history.

Delivered: tenant-safe household and guardian booking contacts with administrator controls, optional staff verification and an explicit boundary preventing clinical-record access through the relationship alone.

Delivered slices: patient timeline, prescriptions/documents, consent history, care tasks, staff invitations, clinic roles, assignment, My Tasks and private notifications.

Delivered: structured care plans with tenant isolation, doctor-approved goals, linked visits, assigned clinic owners, target/review dates and explicit pause, resume, complete and cancel states.

## Phase 2 — WhatsApp booking concierge

Interactive chamber/service/provider/slot selection, only-free-slot responses, booking approval modes, reschedule/cancel, visit history lookup and safe prescription access.

## Phase 3 — Prescriptions and care reminders

Clinician-authored prescriptions, external terminology lookup, medication schedules, reminder acknowledgements, adherence events and escalation. OmniRelay must not recommend drugs or dosages.

Delivered slice: consent-controlled reminders now capture exact patient `DONE`, `SKIP` and `HELP` replies, preserve the source WhatsApp message and create high/urgent staff follow-up tasks for missed care or assistance requests.

## Phase 4 — Durable automation and n8n

Event contracts, idempotent jobs, retries, dead-letter handling, workflow catalogue, tenant configuration, safe secrets and deployment/version rollback.

Delivered slice: appointment and care reminder workers use atomic recoverable leases; exhausted jobs appear in the operations centre and administrators can release one reasoned, rate-limited retry with a tenant-scoped audit trail.

Delivered slice: WhatsApp delivery failures are classified into safe operational causes, shown with recovery guidance in the inbox and operations centre, recorded once per message, and escalated to workspace administrators when failures cluster.

## Phase 5 — RAG and AI operations

Knowledge ingestion, citations, retrieval permissions, evaluations, model routing, cost controls, audit trails, editable FAQ packs and **Arin**, OmniRelay's customer-facing AI agent and VP Marketing persona. Evaluate RAGFlow behind an internal provider-neutral retrieval API; do not couple product workflows or tenant data directly to RAGFlow until security, isolation, operating cost and retrieval-quality benchmarks pass.

## Phase 6 — SaaS billing and OEM operations

₹299/₹499/₹699 entitlements, trials, subscription payments, invoices, dunning, usage meters, OEM tenant administration, support impersonation controls, exports and impact ledger.

## Phase 7 — Omnichannel and vertical expansion

Instagram, email and calendar providers; restaurants, coaching and other vertical packs; catalogues, broadcasts and category-specific automation templates.

## Phase 8 — Marketing automation

Consent-aware segmentation, journeys, attribution, content approval, cross-channel campaigns and evaluation of Mautic/advertools or other open-source components.

## Phase 9 — Production readiness and scale

Load and failure testing, disaster recovery, privacy/legal review, security assessment, operational dashboards, support runbooks, provider production approvals and staged launch.

## Approved backlog — Analytics & Value Dashboard

Scheduled after the complete UI migration and Premium AI Onboarding foundation. A clinic-owner dashboard will show doctor capacity utilisation, booked-to-checked-in funnel drop-off, average wait time, estimated staff hours saved through WhatsApp automation, recovered follow-up revenue and daily delivery-health percentages. Definitions, tenant-safe aggregation and source-of-truth events must be agreed before implementation; no patient-level analytics will be exposed by default.

Each phase ships in reviewable vertical slices; roadmap order may change when provider approvals or safety findings block a dependency.
