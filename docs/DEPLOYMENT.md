# Deployment and handover

## Environments

Maintain independent local, preview/staging and production environments. Production secrets must never be reused in previews.

## Release gate

1. Review the diff and database migrations.
2. Run `npm run lint` and `npm test`.
3. Apply migrations through a reviewed, auditable release path.
4. Deploy a preview and test auth, booking, payment and WhatsApp webhook flows.
5. Take a database backup or confirm point-in-time recovery before risky migrations.
6. Promote the exact verified commit to production.
7. Monitor errors, webhook failures, queue depth and provider delivery states.
8. For a functional product change, complete `docs/knowledge/release-manifest.json` and its referenced release record. CI blocks a release record that is missing, incomplete or not changed with the product source.

## Engineer or external AI access

- Grant a named GitHub role with least privilege.
- Grant separate Supabase and deployment-platform roles; do not share the owner account.
- Provide preview credentials only when possible.
- Require pull requests, CI and human approval for production.
- Give secrets through provider-managed secret stores, never repository files or chat.
- Revoke access and rotate credentials at the end of the engagement.

## Backup ownership

The company should own GitHub, Supabase, Meta, Razorpay and deployment accounts. Schedule database backups, periodically export schema/configuration, and test restoration into an isolated project.
