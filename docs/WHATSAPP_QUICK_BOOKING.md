# WhatsApp Quick Booking

Quick Booking is an additional entry branch, not a second booking engine.

- It reuses the existing tenant-scoped services, assignments, live-slot RPC, overlap protection, consent ledger, payment policy and appointment creation path.
- It skips service, chamber or provider questions only when exactly one valid active option exists.
- If any choice is ambiguous, it presents the existing selectable step instead of choosing for the patient.
- When the clinic path is unambiguous, it searches the next seven days and presents the earliest date with live selectable slots.
- Patient/guardian identity, explicit booking consent, payment handling and final confirmation remain unchanged.
- The regular `Choose appointment` path remains labelled Recommended.
