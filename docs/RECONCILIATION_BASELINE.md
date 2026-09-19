# OmniRelay production reconciliation baseline

Captured: 24 August 2026

## Purpose

This is a read-only baseline for the connected OmniRelay Supabase project. It
prevents later work from recreating, deleting, or changing inherited production
objects merely because their original source history is not in this checkout.

## Verified live baseline

- Supabase project: OmniRelay (`bywsjwpaezdlicsbujbk`), active and healthy.
- Live migration-history entries: 225; latest: `20260824100407_managed_booking_handoff_reconciliation`.
- Local migration files: 144.
- Public tables: 100, all with RLS enabled; private tables: 7.
- Active Edge Functions: 25.

## Reconciliation result

- 133 migration names are represented in both the live history and the local
  Clinic-first checkout.
- 91 live migrations are inherited history and are not represented locally.
- Four local migration names do not match a live history name; this can reflect
  renamed or consolidated historical work and is not evidence that their schema
  changes are absent from production.
- Seven Clinic-owned Edge Function directories are represented locally.
- Eighteen active Edge Functions are inherited and remain production-owned until
  their callers, authentication model, schedules, and rollback path are
  classified.

## Safety rules now in force

1. Do not recreate the 91 inherited migrations from memory.
2. Do not delete, redeploy, revoke, or change an inherited Edge Function without
   a caller/dependency inventory and rollback plan.
3. Treat the live database schema and migration history as authoritative for
   Phase 1 changes.
4. Make future Clinic-first changes only as new, forward-only migrations after
   a read-only impact check against the live schema and function catalogue.
5. Keep security-advisor findings triaged by caller and intent; a warning alone
   is not authorization to revoke a production RPC.

## Closure status

The migration/function-history drift is now a documented and contained
reconciliation boundary. It no longer blocks Phase 1 feature work. The remaining
follow-up is a separate, read-only classification of inherited functions before
any security or operational change touches them.
