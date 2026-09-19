# WhatsApp Booking Production Acceptance

This checkpoint is executable through `node --test tests/whatsapp-booking-production-acceptance.test.mjs` and uses no real patient records.

| Flow | Required result | Automated evidence |
| --- | --- | --- |
| New patient | Standard clinic menu; no false returning-patient claim | Menu policy test |
| Returning patient | Safe recognition and repeat option without clinical disclosure | Menu policy test |
| Repeat booking | Previous service/location/provider reused; live date and slot selected again | Concierge policy and live-slot RPC checks |
| Guardian/dependent | Patient and booking contact remain separate | Relationship mapping and contact-field checks |
| Consent | Exact notice/version/action/channel identity retained before booking | Consent RPC and immutable-ledger checks |
| Live availability | Only database-returned slots are presented | Slot RPC check |
| Concurrent booking | Database exclusion constraint blocks overlap | Appointment constraint check |
| Partial failure | Same appointment is recovered; no duplicate booking or confirmation | Idempotent handoff checks |
| Manual approval | Queue insert failure is visible and never reported as success | Error-path check |
| STOP | Opt-out acknowledgement and session reset | Command-policy test |
| START / MENU | Booking menu can be reopened | Command-policy test |
| Human handoff | Automation pauses for clinic staff | Existing concierge state test |

## Still requiring controlled channel tests

- Meta interactive list and reply-button rendering on the production number.
- Deposit and full-payment success, abandonment and webhook reconciliation.
- Reminder and follow-up delivery outside the 24-hour service window using approved templates.
- Device-level mobile alert delivery when the dashboard is closed; this requires the later PWA push layer.
