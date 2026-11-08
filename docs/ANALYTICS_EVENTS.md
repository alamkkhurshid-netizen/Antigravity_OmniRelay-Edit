# OmniRelay KPI Event Taxonomy & Analytics Schema

**Status:** Canonical Production Specification  
**Version:** 1.0.0  
**Scope:** Standardized KPI Event Taxonomy, Ingestion Schema, Metric Aggregations, and Privacy Constraints.

---

## 1. Overview & Architectural Principles

OmniRelay tracks operations across Healthcare/Clinics, Retail, and Voice channels. All analytical rollups, automated owner reports, and AI operational recommendations are derived deterministically from operational events.

### Core Principles
1. **Deterministic Calculation:** All metric calculations and KPI formulas are evaluated in structured code or SQL, never inferred or guessed by an LLM.
2. **Strict Zero-PHI Constraint:** Under no circumstances are patient names, phone numbers, clinical diagnoses, medical records, or freeform conversation transcripts stored in analytical event payloads or sent to AI models.
3. **Tenant Isolation:** Every event envelope strictly binds to a verified `organization_id` (or `workspace_id`) with PostgreSQL Row Level Security (RLS) enforcement.
4. **Idempotency & Immutability:** Event records are append-only. Each event contains an `idempotency_key` ensuring at-most-once processing.

---

## 2. Universal Event Envelope Schema

Every event recorded into `operational_events_log` conforms to the following JSON structure:

```json
{
  "event_id": "evt_01HZX87K7...",
  "organization_id": "org_uuid_here",
  "event_name": "appointment.completed",
  "timestamp": "2026-10-18T10:30:00.000Z",
  "source": "whatsapp" | "web" | "voice" | "system" | "counter",
  "actor_role": "patient" | "receptionist" | "doctor" | "operator" | "system",
  "actor_id": "usr_uuid_here" | null,
  "idempotency_key": "unique_fingerprint_here",
  "payload": {
    /* Category-specific event attributes */
  }
}
```

---

## 3. Event Taxonomy & Payload Definitions

### 3.1 Category 1: Appointment & Funnel Events

| Event Name | Trigger Moment | Payload Schema | Mapped KPI |
|---|---|---|---|
| `appointment.created` | Patient or staff initiates a booking | `{ appointment_id, resource_id, service_id, source, scheduled_start }` | Total Bookings |
| `appointment.confirmed` | Slot is confirmed (deposit paid or counter confirmed) | `{ appointment_id, resource_id, confirmation_method }` | Confirmed Appointments, Confirmation Rate |
| `appointment.arrived` | Patient arrives at facility / enters queue | `{ appointment_id, token_number, arrival_time }` | Arrival Rate, Waiting Room Intake |
| `appointment.completed` | Consultation/service finished | `{ appointment_id, resource_id, duration_minutes }` | Completion Rate, Doctor Utilisation |
| `appointment.cancelled` | Booking cancelled before service | `{ appointment_id, cancellation_reason_code, initiated_by }` | Cancellation Rate, Lost Revenue |
| `appointment.no_show` | Patient failed to appear without cancellation | `{ appointment_id, resource_id, scheduled_start }` | No-Show Rate, Slot Wastage |
| `appointment.rescheduled`| Appointment moved to different date/time | `{ appointment_id, previous_start, new_start }` | Reschedule Rate |

### 3.2 Category 2: Queue & Patient Flow Events

| Event Name | Trigger Moment | Payload Schema | Mapped KPI |
|---|---|---|---|
| `queue.entry_created` | Token issued to arrived patient | `{ token_id, appointment_id, queue_position }` | Total Daily Inflow |
| `queue.patient_called` | Doctor or assistant calls token into chamber | `{ token_id, resource_id, wait_duration_seconds }` | Average Wait Time, Bottleneck Detection |
| `queue.consultation_ended`| Patient exits consultation chamber | `{ token_id, consultation_duration_seconds }` | Consultation Time, Resource Capacity |
| `queue.delay_flagged` | Wait time exceeds clinic SLA threshold (> 20m) | `{ token_id, wait_duration_seconds, threshold }` | SLA Breach Rate, Overcrowding Warning |

### 3.3 Category 3: WhatsApp & Automation Events

| Event Name | Trigger Moment | Payload Schema | Mapped KPI |
|---|---|---|---|
| `whatsapp.message_dispatched` | Outbound template or session message sent to Meta | `{ message_id, template_name, category, cost_paise }` | Total Messages, Outbound Cost |
| `whatsapp.message_delivered` | Webhook status update: message delivered to handset | `{ message_id, template_name, delivery_latency_ms }` | Delivery Rate (Target: > 96%) |
| `whatsapp.message_read` | Webhook status update: read receipt received | `{ message_id, template_name, read_latency_seconds }` | Read Rate (Target: > 80%) |
| `whatsapp.message_failed` | Delivery failure from Meta or carrier | `{ message_id, error_code, error_subcode }` | Failure Rate, Undelivered Reminders |
| `whatsapp.reminder_automated`| Automated 24h or 2h appointment reminder fired | `{ appointment_id, reminder_id, staff_minutes_saved: 4 }`| Staff Hours Saved (4m per reminder) |

### 3.4 Category 4: Financial & Billing Events

| Event Name | Trigger Moment | Payload Schema | Mapped KPI |
|---|---|---|---|
| `billing.charge_captured` | Pre-appointment deposit or service payment captured | `{ payment_id, appointment_id, amount_paise, payment_mode }` | Gross Revenue, Digital Collection Share |
| `billing.payment_succeeded`| Razorpay / Stripe payment verified | `{ payment_id, amount_paise, fee_paise, net_paise }` | Net Collected Revenue |
| `billing.refund_issued` | Cancellation refund processed | `{ refund_id, payment_id, amount_paise, reason }` | Refund Rate |
| `billing.wallet_deducted` | Utility deduction for WhatsApp or Voice AI minute | `{ transaction_id, channel, units, rate_paise, amount_paise }`| Operational Consumption, Tenant Margin |

### 3.5 Category 5: Retail Events

| Event Name | Trigger Moment | Payload Schema | Mapped KPI |
|---|---|---|---|
| `retail.order_placed` | New store or WhatsApp catalog order received | `{ order_id, total_amount_paise, items_count, channel }` | Total Orders, Average Order Value (AOV) |
| `retail.order_confirmed` | Order acknowledged and sent to fulfillment | `{ order_id, fulfillment_type }` | Order Acceptance Rate |
| `retail.order_dispatched`| Order picked up by carrier / out for delivery | `{ order_id, carrier_name, tracking_number_present }` | Fulfillment Velocity, Dispatch SLA |
| `retail.order_delivered` | Order verified delivered to recipient | `{ order_id, transit_hours }` | Order Fulfillment Success Rate |
| `retail.cart_abandoned` | Cart inactive for > 15m without checkout | `{ cart_id, total_amount_paise, item_count }` | Cart Abandonment Rate |
| `retail.cart_recovered` | Recovery WhatsApp template converted to checkout | `{ cart_id, order_id, recovered_amount_paise }` | Abandonment Recovery Rate |

### 3.6 Category 6: Voice AI Events

| Event Name | Trigger Moment | Payload Schema | Mapped KPI |
|---|---|---|---|
| `voice.call_initiated` | Inbound telephony call received via Exotel/SIP | `{ call_id, caller_hash, vertical }` | Total Inbound Voice Volume |
| `voice.call_completed` | Voice AI session closed | `{ call_id, duration_seconds, outcome, latency_avg_ms }`| Voice Minutes Consumed, Avg Duration |
| `voice.appointment_booked`| Voice AI successfully confirmed appointment | `{ call_id, appointment_id, slot_time }` | Voice Booking Conversion Rate |
| `voice.call_escalated` | Caller requested human or emergency triage triggered | `{ call_id, escalation_reason, destination_number_hash }`| Escalation Rate, Receptionist Fallback |

---

## 4. Event-to-Metric Mapping Table

This matrix dictates how the application rollups and BI pipelines compute core business metrics:

| Canonical KPI | Source Events Required | Formula / Aggregation Logic |
|---|---|---|
| **Booking Funnel** | `appointment.created`, `appointment.confirmed`, `appointment.arrived`, `appointment.completed` | Step-by-step conversion percentages: `Confirmed / Created`, `Arrived / Confirmed`, `Completed / Arrived`. |
| **Doctor Capacity Utilisation** | `appointment.completed`, Clinic Operating Schedule | `(SUM(duration_minutes) / Scheduled_Working_Hours) * 100` |
| **Average Wait Time** | `queue.patient_called`, `queue.entry_created` | `AVG(queue.patient_called.time - queue.entry_created.time)` in minutes. |
| **Staff Hours Saved** | `whatsapp.reminder_automated` | `COUNT(whatsapp.reminder_automated) * 4 minutes / 60` |
| **WhatsApp Delivery Efficiency**| `whatsapp.message_delivered`, `whatsapp.message_dispatched` | `(COUNT(delivered) / COUNT(dispatched)) * 100` |
| **WhatsApp Read Engagement** | `whatsapp.message_read`, `whatsapp.message_delivered` | `(COUNT(read) / COUNT(delivered)) * 100` |
| **Gross Follow-Up Revenue** | `billing.charge_captured`, `appointment.completed` | `SUM(amount_paise) WHERE service_category = 'follow_up' OR repeat_patient = true` |
| **Voice AI Conversion Rate** | `voice.appointment_booked`, `voice.call_completed` | `(COUNT(voice.appointment_booked) / COUNT(voice.call_completed)) * 100` |
| **Retail Abandonment Recovery**| `retail.cart_recovered`, `retail.cart_abandoned` | `(COUNT(retail.cart_recovered) / COUNT(retail.cart_abandoned)) * 100` |

---

## 5. Privacy, Zero-PHI & Data Sanitation Guidelines

To comply with HIPAA, GDPR, and Indian Digital Personal Data Protection Act (DPDPA):

1. **Strictly Prohibited Fields:**
   - Patient First/Last Names
   - Telephone Numbers / Mobile MSISDNs (must use SHA-256 one-way salted hashes if tracking repeat callers)
   - Home / Residential Addresses
   - Medical Prescriptions, Clinical Notes, ICD-10 Diagnostic Codes
   - Free-text appointment remarks or reason-for-visit text

2. **Permitted Identifiers:**
   - Synthetic Primary Keys (`appointment_id`, `resource_id`, `service_id`, `order_id`, `token_id`)
   - High-level classification codes (`service_category: "general_consultation" | "pediatrics" | "dental"`)
   - Numerical metrics (durations, waiting minutes, token counts, paise amounts)

3. **Data Retention Policy:**
   - Raw granular event records: Retained in hot storage for 90 days.
   - Daily/Monthly aggregate rollups: Retained indefinitely in `clinic_analytics_daily_rollups` for year-over-year reporting.
