# OmniRelay — Product Features Specification & Clinical Capabilities

**Platform:** OmniRelay Clinical SaaS & Multi-Tenant Operating System  
**Version:** 2.0 (Production Ready)  
**Target Environment:** Vercel Production (`https://omnirelay-main.vercel.app`) & Supabase Mumbai (`ap-south-1`)

---

## 1. Executive Summary

OmniRelay is an enterprise-grade clinical workflow and patient communication platform designed for clinics, multi-doctor polyclinics, and healthcare systems. The platform coordinates every step of the patient lifecycle—from voice-based intake and WhatsApp booking confirmations to live clinic CRM updates, automated doctor roster broadcasts, and morning reminder dispatches.

---

## 2. Core Clinical Communication Lifecycle

### 2.1 Automated Patient WhatsApp Confirmation
*Immediately on booking creation (web, CRM, or AI Voice receptionist).*
- **Trigger:** Automated PostgreSQL trigger (`queue_appointment_reminders`) listening to `appointments` inserts/updates.
- **Delivery Engine:** Supabase Edge Function (`appointment-reminder-dispatch`) communicating with the Meta WhatsApp Cloud API.
- **Message Contract:** Official 8-variable Meta-approved utility template:
  1. `{{1}}`: Patient Name
  2. `{{2}}`: Clinic / Organization Name
  3. `{{3}}`: Doctor Name & Specialization
  4. `{{4}}`: Appointment Date & Time
  5. `{{5}}`: Queue Token Number
  6. `{{6}}`: Clinic Location / Address Link
  7. `{{7}}`: Preparation Instructions (e.g., fasting requirements)
  8. `{{8}}`: Helpdesk / Front-Desk Contact Number
- **Verification:** Validated via automated test suite `tests/appointment-reminder-dispatch.test.mjs`.

### 2.2 Live Application CRM & Encounter Synchronization
*Atomic, real-time reflection of all appointment states across the front-desk dashboard.*
- **Instant Record Creation:** Every booking atomically updates the PostgreSQL `appointments` table and syncs or creates a `patient_profiles` record.
- **Reception Queue Board (`/app/appointments`):** Displays real-time patient queue tokens, check-in statuses (`booked`, `arrived`, `in_consultation`, `completed`, `cancelled`, `no_show`), and payment collection status.
- **Patient 360 Timeline (`/app/contacts`):** Complete chronological history of patient visits, prescriptions, WhatsApp interaction logs, and adherence status.

### 2.3 Doctor Multichannel Briefing & Shift Notifications
*Keeping doctors informed before and during their clinic shifts.*
- **Evening Schedule & CSV Roster Email:** Automated dispatch via Resend API (`/api/clinic-operations/roster/dispatch`) sending doctors a clean HTML summary of their scheduled sessions along with an attached `roster-[date].csv` file containing their patient caseload.
- **1-Hour Pre-Shift WhatsApp Queue Update:** Dispatched by the `doctor-queue-dispatch` edge function 60 minutes prior to shift commencement:
  - Doctor Name
  - Clinic Branch & Session Time
  - Total Booked Patients
  - Link to doctor's active patient list
- **Exception Alerts:** Front-desk UI (`/app/clinic-operations`) flags missing doctor contact details or unconfirmed shifts.

### 2.4 Automated Day-of-Appointment Reminders
*Proactive, dual-sided notifications ensuring zero lost clinic capacity.*
- **Patient 24h & 2h Reminders:**
  - `reminder_24h`: Sent 24 hours prior to appointment to confirm attendance.
  - `reminder_2h`: Sent 2 hours prior to the slot on the day of the appointment with Google Maps clinic directions and token details.
  - **Interactive Rescheduling:** Includes quick-reply buttons allowing patients to confirm or request a reschedule directly inside WhatsApp.
- **Doctor Daily Caseload Briefing:**
  - Sent on the morning of appointments summarizing expected patient flow, special care cases, and empty slot capacity.

---

## 3. Grounded AI Voice Telephony Concierge

- **Infrastructure:** Live Oracle Cloud Infrastructure (OCI) microservice deployed at Mumbai edge (`130.210.29.75.sslip.io`).
- **Performance:** Sub-400ms end-to-end latency with real-time speech processing.
- **Stack:**
  - **Speech-to-Text (STT):** Deepgram Nova-2 with Indian English & multi-lingual acoustic model.
  - **LLM Reasoning:** Groq LPU (Llama 3.3 70B Versatile) for deterministic clinical entity extraction and slot-filling.
  - **Text-to-Speech (TTS):** Cartesia Sonic ultra-low latency voice synthesis.
  - **Voice Pipeline Engine:** Pipecat WebRTC framework with Redis TLS state cache.
- **Capabilities:**
  - Inbound reception answering, doctor schedule lookups, live appointment slot booking with `source: "Voice"` tagging.
  - Graceful warm handoff to human front-desk receptionists when clinical escalation is detected.

---

## 4. Clinic Operations & Care Continuity

### 4.1 Clinic Operations Suite (`/app/clinic-operations`)
- **Visiting Consultant Management:** Multi-shift roster tracking across morning, afternoon, and evening sessions.
- **Capacity Monitoring:** Real-time metrics tracking total doctors visiting, booked capacity vs. available slots, and live patient flow.
- **Pre-Dispatch Checks:** Pre-flight validation verifying WhatsApp sender health, doctor phone numbers, and template availability before shift dispatch.

### 4.2 Action Centre (`/app/action-centre`)
- **Priority Triage Queue:** Consolidates unconfirmed appointments, overdue follow-ups, and failed message retries into a single actionable queue.
- **Claim & Resolve Mechanism:** Front-desk operators claim triage items to prevent duplicate staff intervention.

### 4.3 Care Plans & Post-Consultation Follow-Up (`/app/care-plans`)
- **Longitudinal Patient Journeys:** Automated care protocol adherence tracking for chronic care (diabetic care, hypertension, post-op recovery).
- **Consented Automation:** WhatsApp check-ins dispatched only with verified patient consent.
- **Atomic Prescription Issuance:** Digital prescriptions committed via atomic PostgreSQL RPCs (`issue_prescription_v1`) ensuring zero partial write states.

---

## 5. Security, Tenancy & Compliance Architecture

- **PostgreSQL Row Level Security (RLS):** 100% table coverage with strict tenant isolation (`workspace_id` scoping) across 210 verified database migrations.
- **Zero-PHI Telemetry:** Automatic sanitization of patient identifiers before analytics aggregation or operational logging.
- **Meta WhatsApp Security Guard:** Rigid environment verification (`isWhatsAppStagingAllowed`) enforcing staging/production environment binding and cryptographic HMAC-SHA256 signature verification.
- **High-Availability Datastore:** Colocated Supabase PostgreSQL in Mumbai (`ap-south-1`) with sub-10ms query execution.

---

## 6. Signature Design System

- **Executive High-Density UI:** Purpose-built for high-speed receptionists and clinicians—high contrast typography, compact data tables, zero layout shift.
- **OmniRelay Trademark Card (`.or-trademark-card`):** Distinctive 4px top highlight accent line (`linear-gradient(90deg, #49dbc4, #4d9af5)`) providing unified visual identity across all metric and operational cards.
