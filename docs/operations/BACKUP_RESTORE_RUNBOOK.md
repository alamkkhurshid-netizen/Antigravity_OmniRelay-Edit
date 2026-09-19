# OmniRelay backup and restore runbook

## Scope and safety rule

This runbook covers the existing OmniRelay Supabase project and Site. A practice restore must never target production. Real patient rows, uploaded reports, prescriptions, photos and documents must not be copied into an uncontrolled environment.

## Verified recovery position — 15 August 2026

| Recovery component | Verified state | Current limitation |
| --- | --- | --- |
| Site source | Recoverable through the existing Site checkpoints | Checkpoint recovery does not restore database rows |
| Clinic migrations | 85 SQL files are present in this checkout | The live database records 172 migrations beginning in 2025; 87 earlier migrations are not present here |
| Live schema controls | PostgreSQL 17.6; 79 public tables; all 79 have RLS enabled; 179 policies; 101 user triggers | Counts are evidence, not a schema backup |
| Edge Functions | Clinic-owned function source is present for booking and reminder dispatch | The live project also has legacy/platform functions not represented in this checkout |
| Database rows | No patient-data export was performed during this checkpoint | An encrypted, off-site logical backup destination and retention policy are not configured here |
| Storage objects | Private-storage policies exist in the application design | Supabase database backups contain Storage metadata, not the binary objects |
| Secrets | Names are documented; values remain in provider-managed secret stores | Database restores do not recreate every external secret or custom-role password |

The connected project is healthy. This checkpoint deliberately performed metadata-only queries and read no patient or customer rows.

## Recovery objectives

Until an independent backup job and isolated restore have passed, the honest data recovery objective is **not guaranteed**.

Pilot target after closure:

- Database RPO: 24 hours.
- Storage-object RPO: 24 hours.
- Service RTO: 4 hours after infrastructure and credentials are available.
- Schema/source RPO: the latest reviewed Site checkpoint and migration commit.

For production healthcare use, move to a paid backup tier before depending on managed recovery. Point-in-time recovery is a later cost decision, not part of this checkpoint.

## Backup inventory

Maintain these independently:

1. Application source and immutable release/checkpoint identifier.
2. Complete ordered database migrations, including the missing pre-July-2026 baseline.
3. Encrypted logical database backup, stored outside the Supabase project.
4. Separate encrypted copy or replication of private Storage objects.
5. Edge Function source plus deployment configuration.
6. Environment-variable names and a credential-recovery procedure. Never place secret values in this repository.
7. Meta, Razorpay and callback configuration inventory.

## Encrypted logical backup command

Run `scripts/create-supabase-backup.sh` only on a trusted operator machine. It fails closed unless the Supabase CLI, `age`, an external absolute destination, a database connection string and an `age` public recipient are supplied. It creates separate roles, schema and core operational-data dumps using Supabase's filtered dump command, encrypts them before they leave the temporary workspace, writes a checksum and removes plaintext temporary files.

Example environment names—not values:

```sh
export OMNIRELAY_DATABASE_URL='[SESSION_POOLER_CONNECTION_STRING]'
export OMNIRELAY_BACKUP_AGE_RECIPIENT='[AGE_PUBLIC_RECIPIENT]'
export OMNIRELAY_BACKUP_DIR='[ABSOLUTE_OFF_REPOSITORY_DESTINATION]'
bash scripts/create-supabase-backup.sh
```

Never paste these values into chat, commit them, or save them in an `.env` file. The destination must itself have access controls, retention and deletion protections. The generated encrypted file still contains regulated patient data and must be handled accordingly.

This script does not back up Storage binary objects. Those require a separate encrypted export/replication job with the same tenant and patient access controls.

### Medicine catalogue recovery

`medicine_catalog_entries` is a large, regenerable reference catalogue. On IPv4-only operator networks, the shared Session Pooler can close its long `COPY` stream before a full data dump completes. The backup scripts therefore exclude this table from `data.sql`; patient, appointment, payment, consent, WhatsApp and other operational rows remain in the encrypted core backup.

For complete catalogue recovery, include the original approved `CommonDrugCodesForIndia_FlatFilePackage` zip with the backup:

```sh
export OMNIRELAY_MEDICINE_CATALOG_SOURCE_PACKAGE='[ABSOLUTE_PATH_TO_APPROVED_CATALOGUE_ZIP]'
bash scripts/create-supabase-backup.sh
```

The zip is copied into the encrypted archive and can be re-imported only in the isolated recovery target using the reviewed catalogue-import process. If it is absent, the manifest explicitly marks catalogue recovery as incomplete; do not describe that artifact as a full catalogue backup.

For the approved free Windows pilot procedure, use `FREE_BACKUP_WINDOWS.md` and `scripts/Create-OmniRelayBackup.ps1`. Paid managed backups, PITR and paid cloud destinations remain deferred.

## Pre-restore gates

Before any restore:

1. Name an incident commander and record approval, reason, source backup timestamp and exact target.
2. Confirm the target is an isolated non-production project. A drill must not use the production project reference.
3. Confirm any branch/project cost before creation.
4. Verify backup checksum, encryption, retention authorization and chain of custody.
5. Put the affected environment into maintenance mode and stop write-producing workers if this is a real incident.
6. Preserve a fresh recovery point of the current state before destructive recovery.
7. Confirm the database and Storage backups correspond to the same recovery window.

## Isolated restore drill

1. Create an empty, isolated Supabase target only after cost approval.
2. Restore the complete historical schema/migration baseline. Do not start from the 85 recent files alone.
3. Restore an authorized encrypted logical backup. For a routine drill, use synthetic data or an appropriately de-identified fixture. The `prescriptions`, `whatsapp_acceptance_test_runs` and `whatsapp_acceptance_payments` data have circular foreign-key relationships. Restore them only through an isolated, reviewed procedure that temporarily handles those constraints, then validate every constraint before promoting anything.
4. Restore Storage binaries separately; verify that objects remain private and tenant/patient paths are preserved.
5. Redeploy the exact reviewed Edge Function versions.
6. Re-enter secrets through Supabase secret storage. Rotate credentials if exposure is suspected.
7. Configure Auth URLs, Site URL, Meta webhook callback/verify token and Razorpay callback for the isolated target. Do not allow the drill to message real patients or charge real payments.
8. Run `scripts/verify-recovery-readiness.sql` using a read-only database session.
9. Run the application test suite and synthetic acceptance tests.
10. Record pass/fail evidence in `RESTORE_DRILL_CHECKLIST.md`.

## Validation gates

The drill passes only when all are true:

- Migration history is complete and ordered.
- Every public table has RLS enabled.
- Expected policies, functions, triggers, indexes and extensions are present.
- Anonymous/authenticated function grants match the reviewed production surface.
- Cross-tenant and guardian/dependent tests pass with synthetic records.
- Concurrent booking cannot double-book a slot.
- WhatsApp webhook signature checks and replay/idempotency controls pass without contacting real patients.
- Payment callbacks use test mode and remain idempotent.
- Private documents cannot be listed or fetched across patients or organisations.
- Required audit, consent and identity events are retained.
- Source build and automated tests pass.

## Failure and rollback

If any validation fails, keep production unchanged, mark the drill failed, preserve logs without patient content, and correct the recovery asset or procedure. Do not promote the restored target. Destruction of a drill target requires explicit approval and confirmation that no unique evidence remains there.

## Current blockers

1. The repository lacks the complete 2025–July 2026 migration baseline recorded by the live project.
2. No approved encrypted off-site destination and retention policy exists for logical database backups.
3. No separate Storage-object backup has been verified.
4. No isolated Supabase restore target was authorized; therefore no destructive or data-bearing restore was attempted.
