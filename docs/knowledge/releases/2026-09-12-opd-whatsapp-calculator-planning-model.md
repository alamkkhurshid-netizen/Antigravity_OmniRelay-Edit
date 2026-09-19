# OPD WhatsApp calculator planning model

## Purpose

The home-dashboard WhatsApp calculator gives a clinic owner a simple monthly planning estimate. It is not an invoice, a wallet balance, or a decision to send a message.

## Inputs and assumptions

- Patients per doctor per day is the average flow for one available doctor.
- Doctors available multiplies that daily flow, so multi-doctor OPDs receive a realistic volume estimate.
- OmniRelay uses 26 working days for a six-day clinic week.
- Each booked visit is modelled with three proactive utility messages: confirmation, 24-hour reminder and 2-hour reminder.
- Follow-up messages are not assumed for every visit. The calculator adds one only for each patient whose clinician has set a follow-up date.
- Medication messages are not guessed. The clinic enters the total reminders planned, because dose frequency and duration vary by patient.
- Marketing is optional and uses only the consented audience and number of planned campaigns.

## Planning markup

The calculator uses two separate planning tracks. Utility and authentication use wider growth discounts: Starter 25%, Growth 20%, Scale 15%, Enterprise 10%. Marketing is flatter: Starter 22%, Growth 20%, Scale 19%, Enterprise 18%.

The displayed tier is a planning tier based on the estimate. A future live billing tier must be locked from reconciled prior-month usage rather than changing per message.

## Rate and compliance boundary

The India message values entered on 12 September 2026 are stored as an inactive **draft planning rate card**. They cannot price shadow observations, debit a wallet, block a send, or create an invoice. Before any activation, OmniRelay must reconcile the rate card with Meta's published India pricing and actual delivered-message evidence.

Meta pricing is category and market based. Eligible service-window and ad-entry messages can be free, so the planning calculator does not treat its estimate as a final delivered-message bill.

## Interface guidance

Every calculator field, message scope, total and rate-card boundary has a small information button. It explains the calculation in plain language and does not reveal internal markup rules.
