# OmniRelay SaaS Scope Charter

**Status:** Frozen product and delivery scope  
**Effective date:** 13 September 2026  
**Owner:** Khurshid Alam, Founder  
**Technical owner:** OmniRelay CTO function  

## 1. Purpose

This charter records what OmniRelay can offer now, what is committed next, and what remains future roadmap. It prevents sales, product and engineering from describing planned capabilities as live features.

OmniRelay is a multi-tenant business-automation SaaS. The first production vertical is clinics and OPDs; the reusable platform is designed for later hospitality, retail and high-ticket-service workflows.

## 2. Product promise

OmniRelay helps a business receive conversations, turn them into structured work, automate approved routine communication, and surface exceptions to people. It must preserve consent, tenant isolation, auditability and human control.

The platform is intended to be **self-operating for routine work**, not autonomous for clinical, legal, payment, emergency or irreversible decisions.

## 3. What may be offered in the controlled clinic pilot

### Clinic operations

- Tenant-aware clinic workspace, team access and protected patient/contact records.
- Chambers, services, providers, schedules and live appointment availability.
- Public booking link and branded QR booking entry point.
- Appointment confirmation, approval modes, reschedule, cancellation and payment choice.
- Pay-at-clinic and approved Razorpay payment paths where configured.
- Calendar, reception actions, care plans, prescriptions/documents and continued-care tasks within authorised workflows.
- Multi-doctor foundations: provider/chamber/schedule routing, roster visibility and doctor-specific communication controls.

### WhatsApp and communication

- Meta WhatsApp Cloud API connection, webhook ingestion, operational inbox and message-status reconciliation.
- Interactive booking concierge with provider/chamber/slot choices, repeat booking, bookings lookup and human handoff.
- Approved template use for booking, reminders, reschedule/cancel, follow-up, medication reminders, payment actions and emergency notices.
- Consent-aware campaigns, opt-out handling and Communication Controls for future eligible communications.
- Real-time inbox updates and protected staff replies within the allowed customer-service window.

### Safety and operations

- Organisation-scoped permissions and Row Level Security.
- Consent and audit evidence, rate limits, protected privileged operations and reversible staff deactivation.
- Automation queue, bounded retries, dead-letter/recovery controls, delivery-status reconciliation and operational alerts.
- Encrypted database backup process with checksum verification.
- Pilot Readiness GO/HOLD records, named owner/rollback owner and patient-free acceptance evidence.

### Customer-facing product help

- OmniRelay Guide provides product-help knowledge only. It does not read clinic data or provide clinical advice.

## 4. Current product boundaries

The following must not be claimed as generally live until their specific activation gates are complete:

- Unattended patient automation at scale.
- Real-time patient token messaging (for example, “token 18 is now serving 15”).
- Substitute-doctor reassignment with documented patient approval.
- Production wallet charging, top-ups, invoices or automatic billing collection.
- Clinic-specific RAG assistant, autonomous AI operations or AI creative billing.
- Google Calendar connection.
- Native Android or iOS application.
- Restaurant, retail, real-estate or automotive vertical packs.
- Founding 100 partner portal and territory allocation.

## 5. Committed next releases

### A. Communication reliability and pilot closure

Before broader clinic launch, delivery-verify confirmation, 24-hour reminder, 2-hour reminder, reschedule, cancellation and follow-up flows. Use bounded consented tests and retain only privacy-safe evidence.

### B. Mobile/PWA Foundation

- Installable staff PWA with correct Android/iOS icon assets and Apple metadata.
- Mobile-first touch targets, responsive data-card patterns and 320px viewport QA.
- No offline caching of patient data, documents, API responses, booking/manage links or secrets.

### C. Business Setup and onboarding refinement

- Faster clinic setup for single-doctor and multi-doctor OPDs.
- Clear provider, chamber, schedule, service, brochure and location configuration.
- Progress/status view showing the items that block safe booking activation.

### D. One-way Google Calendar connection

**Locked boundary:** OmniRelay is the appointment system of record. OmniRelay creates, updates and cancels matching Google Calendar events. Google Calendar never creates, modifies, reschedules or cancels OmniRelay appointments.

Each provider or clinic may connect a selected calendar. Tokens remain server-side; every appointment has an idempotent calendar-event mapping and failed sync is visible for retry.

### E. OmniRelay Sales RAG Concierge

This is a separate OmniRelay-owned WhatsApp sales assistant for pre-launch prospects. It uses approved OmniRelay product knowledge, prices/features approved by the founder, interactive lead qualification and human handoff. It must not access clinic patient data, provide clinical advice or invent commercial claims.

Target: controlled inbound launch within 10 days of scope approval; marketing broadcast only after approved Meta template, consent/opt-out controls and bounded conversation testing.

## 6. Productisation framework: self-operating SaaS

To serve many customers without bespoke engineering, OmniRelay will use the following operating model:

1. **Shared engine, private tenant configuration.** One workflow/RAG execution platform; each customer has isolated knowledge, channels, settings, permissions and logs.
2. **Template-first onboarding.** A business selects a vertical and approved automation blueprint, then configures safe parameters instead of requesting source-code changes.
3. **Preview, test, publish.** Every customer configuration is previewed and tested with a verified recipient before activation.
4. **Guarded execution.** Consent, template approval, timing, channel health, permissions, balance and policy conditions are checked before an action runs.
5. **Exception-first human work.** Staff work only low-confidence answers, failures, missing consent, payment mismatch, unusual requests and approval decisions.
6. **Versioned rollback.** Templates, knowledge packs and workflows retain version/audit history and may be paused or rolled back without deleting evidence.
7. **Tenant-safe observability.** The platform records aggregate health, delivery and usage signals without exposing unnecessary patient data in administrative views.

Target after productisation: 75–80% of routine clinic work automated in SaaS v1, progressing to 85–90% for standard tenant setups. Human review remains mandatory for exceptional, clinical, legal, payment, emergency and irreversible decisions.

## 7. RAG platform scope

### Layer 1 — OmniRelay Guide

Product-help knowledge for users of OmniRelay. It is separate from tenant data.

### Layer 2 — tenant WhatsApp RAG assistant

Each business may upload or configure approved non-clinical sources such as FAQ, service catalogue, doctor directory, brochure, clinic timing/location and policies. The assistant answers from the tenant’s isolated source set, exposes citations/answer confidence to staff, and hands off when information is missing or sensitive.

### Layer 3 — premium AI operations

Future paid capability: usage and operational-value analysis, recommendations, content/creative suggestions, monthly owner reports and vertical-specific AI assistants.

RAG is not permitted to diagnose, prescribe, make clinical decisions, independently send high-risk messages or receive unrestricted patient records.

## 8. Business analytics and OmniRelay Admin

### Clinic owner analytics

Planned dashboard metrics:

- Booking-to-arrival funnel and no-show trend.
- Provider capacity and schedule utilisation.
- Communication delivery health and unresolved exceptions.
- Follow-up and care-task completion.
- Estimated operational time saved and recovered opportunity, with explicit metric definitions.
- Billing/usage drill-down after reconciliation activation.

### OmniRelay Admin / OEM control plane

Planned controls:

- Tenant provisioning, onboarding health and channel/template status.
- Aggregate tenant health, safe support tooling and feature flags.
- Workflow/template/RAG-pack versions, rollout gates and rollback.
- Billing reconciliation, statement generation and exception queue.
- Support and audit controls without unrestricted patient-data access.

## 9. Billing boundary

Operational wallet, rate card, calculator, ledger and analytics foundations remain in **shadow mode**. No clinic is charged through OmniRelay until Meta costs, Razorpay settlements and usage ledger reconcile for a complete pilot cycle.

When activated, the intended commercial structure is:

- Fixed SaaS subscription for product access.
- One operational wallet for approved WhatsApp usage and paid AI creatives.
- Transparent usage ledger, invoices/statements and reconciliation.

## 10. Founding 100 network strategy

The Founding 100 is a future commercial-distribution product, not a current clinic-pilot feature.

Planned scope:

- Exclusive 15 km territory opportunity with availability checks.
- AI-gated partner assessment, compliance screening and interview dossier.
- Vertical selection for clinic, hospitality, retail and high-ticket services.
- Provisional territory reservation, founder review and partner onboarding.
- Commercial model and revenue share are subject to final founder/legal approval before public publication.

## 11. Delivery timeline

| Milestone | Target window |
| --- | --- |
| OmniRelay Sales RAG controlled launch | Within 10 days of execution approval |
| Three-clinic controlled pilot | Planned next-to-next week |
| Pre-launch WhatsApp broadcast readiness | 1 November 2026 |
| Evidence-based clinic MVP production readiness | Late November to mid-December 2026 |
| Self-operating clinic SaaS v1: configuration, analytics and admin foundations | January–February 2027 |
| Founding 100, broader admin/analytics and multi-vertical foundation | March–June 2027 |
| Native Android/iOS application | After web/PWA pilot validation; target mid-2027 |

Dates are delivery targets, not automatic activation authorisation. Meta approvals, consent evidence, external-provider availability and pilot findings can move an activation date.

## 12. Mandatory release gates

Every product change follows:

1. Written scope and safety boundary.
2. Tenant-safe implementation and migration review where applicable.
3. Automated tests and build verification.
4. Knowledge-base/release record update.
5. Controlled test or preview.
6. Founder approval for production activation when customer communication, billing, permissions or patient data are affected.
7. Rollback path, monitoring and post-release evidence.

## 13. Source of truth and change control

- PostgreSQL/Supabase remains the system of record.
- External systems, including Meta, Razorpay and future Google Calendar, are reconciled through stable external IDs and idempotent work.
- GitHub is the durable engineering reference; production deployment does not replace source control.
- This charter is updated only through an approved release/change decision. A feature in the roadmap is not a customer-facing promise until marked active and evidence-verified.

