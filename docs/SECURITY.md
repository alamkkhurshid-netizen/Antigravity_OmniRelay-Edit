# Security and privacy

## Required invariants

- Keep privileged keys out of browser bundles.
- Verify Meta webhook signatures and Razorpay webhook signatures.
- Enforce tenant isolation with RLS and least-privilege schema grants.
- Record consent source, timestamp and purpose for outbound communication.
- Avoid clinical diagnosis, prescribing or dosage recommendations from AI.
- Treat patient, appointment and prescription data as sensitive health information.
- Audit privileged operator access and destructive actions.

## Open hardening work

- Define purpose-specific RLS policies for `private.platform_operators` and `private.customer_booking_access`; schema privileges currently restrict access but are not the final control.
- Review database-advisor findings for mutable function search paths, public extensions and anonymously executable security-definer functions.
- Add automated cross-tenant tests for every sensitive table and RPC.
- Add rate limits, abuse controls, webhook replay protection, secret rotation runbooks and incident response.
- Complete retention, deletion, export and backup-restore drills before production health-data use.

Security changes require migration review and rollback planning; do not enable policies blindly on production tables.
