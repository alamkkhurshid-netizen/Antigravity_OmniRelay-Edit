# OmniRelay isolated restore drill checklist

Drill ID: __________  Date: __________  Owner: __________

Source backup timestamp: __________  Target project: __________

The target is non-production: PASS / FAIL

## Authorization and containment

- [ ] Cost and target creation approved.
- [ ] No production project reference is used as the restore target.
- [ ] Synthetic or expressly authorized data only.
- [ ] Outbound WhatsApp, email and payment effects are disabled or sandboxed.
- [ ] Backup checksum and encryption verified.

## Restore

- [ ] Complete historical migration baseline restored.
- [ ] Logical database backup restored.
- [ ] Storage objects restored separately.
- [ ] Edge Functions redeployed from reviewed source.
- [ ] Secrets entered through provider secret storage, not files or chat.
- [ ] Auth and webhook callback URLs point only to the drill environment.

## Verification evidence

| Check | Result | Evidence/reference |
| --- | --- | --- |
| Read-only recovery SQL | PASS / FAIL | |
| All public tables use RLS | PASS / FAIL | |
| Function grants reviewed | PASS / FAIL | |
| Cross-tenant isolation | PASS / FAIL | |
| Guardian/dependent identity | PASS / FAIL | |
| Booking concurrency | PASS / FAIL | |
| WhatsApp signature/idempotency | PASS / FAIL | |
| Payment test-mode/idempotency | PASS / FAIL | |
| Private Storage isolation | PASS / FAIL | |
| Consent/audit evidence | PASS / FAIL | |
| Application build/tests | PASS / FAIL | |

Final outcome: PASS / FAIL

Open defects and owner: ________________________________________________

Incident commander approval: __________________________________________

