import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("P0 Runtime Controls: Strict Platform-Operator Authorization & Allowlist Invariants", () => {
  const routeSource = readFileSync(new URL("../app/api/operator/runtime-controls/route.ts", import.meta.url), "utf8");
  const migrationSource = readFileSync(new URL("../supabase/migrations/20261010000007_reconcile_post_baseline_bindings.sql", import.meta.url), "utf8");

  // 1. Explicit allowlist required in route and migration
  assert.match(routeSource, /ALLOWED_CONTROL_KEYS\s*=\s*\[/, "Route must define explicit ALLOWED_CONTROL_KEYS");
  assert.match(routeSource, /ALLOWED_CONTROL_KEYS.*\.includes\(/, "Route must validate controlKey against allowlist");
  assert.match(migrationSource, /p_control_key NOT IN/, "Migration RPC must validate controlKey against allowlist");

  // 2. Global controls restricted strictly to private.platform_operators
  assert.match(routeSource, /platform_operators/, "Route must query private.platform_operators table");
  assert.match(routeSource, /isPlatformOperator/, "Route must check platform operator status");
  assert.match(routeSource, /Forbidden: Global controls strictly require platform operator authorization/, "Must reject non-platform operator on global controls");
  assert.doesNotMatch(routeSource, /const isOperator = \["admin", "owner", "platform_operator"\]\.includes/, "Must NOT treat workspace admin/owner as platform operator");
  assert.match(migrationSource, /EXISTS \(\s*SELECT 1 FROM private\.platform_operators/, "Migration RPC must check private.platform_operators for global scope");

  // 3. Cross-tenant spoofing guard: tenant admin cannot provide another org ID
  assert.match(routeSource, /body\.organizationId !== organization\.id/, "Route must detect cross-tenant spoofing");
  assert.match(routeSource, /Cross-tenant organization modification denied/, "Route must reject cross-tenant spoofing");

  // 4. Reason and emergency expiry requirements
  assert.match(routeSource, /reason\.length < 5/, "Route must enforce min 5 chars reason");
  assert.match(routeSource, /expiresAt/, "Route must validate expiresAt on emergency overrides");
  assert.match(migrationSource, /length\(trim\(p_reason\)\) < 5/, "Migration RPC must enforce min 5 chars reason");
  assert.match(migrationSource, /p_expires_at IS NULL OR p_expires_at <= now\(\)/, "Migration RPC must enforce future expiry on emergency");

  // 5. Audit logging on denied attempts
  assert.match(routeSource, /RUNTIME_CONTROL_DENIED/, "Route must record audit on denied attempts");
  assert.match(migrationSource, /RUNTIME_CONTROL_DENIED/, "Migration RPC must record audit on denied attempts");
});

test("P0 Carrier Recovery: Role Authorization, Lifecycle Transitions & Optimistic Versioning", () => {
  const routeSource = readFileSync(new URL("../app/api/action-centre/carrier-recovery/route.ts", import.meta.url), "utf8");

  // 1. Role requirements: owner, admin, or receptionist
  assert.match(routeSource, /\["owner", "admin", "receptionist"\]\.includes/, "Route must restrict access to owner, admin, or receptionist");
  assert.match(routeSource, /Receptionist or administrator role required/, "Route must reject unauthorized roles");

  // 2. Lifecycle: Unclaimed -> claim required before resolve/retry
  assert.match(routeSource, /Task must be claimed before it can be resolved or retried/, "Route must require claim before resolve or retry");

  // 3. Lifecycle: Claimed -> resolve/retry only by claimant or admin
  assert.match(routeSource, /claimedBy !== user\.id && !isAdmin/, "Route must enforce that only claimant or admin can resolve/retry");
  assert.match(routeSource, /Only the assigned task owner or an administrator can resolve or retry/, "Route must reject non-claimant receptionist");

  // 4. Lifecycle: Resolved -> immutable
  assert.match(routeSource, /This carrier recovery task is already resolved and immutable/, "Resolved tasks must be immutable");

  // 5. Lifecycle: Expired -> admin recovery only
  assert.match(routeSource, /isExpired && !isAdmin/, "Expired tasks must require admin for recovery");
  assert.match(routeSource, /Only an administrator can recover an expired carrier recovery task/, "Non-admin must be rejected on expired tasks");

  // 6. Concurrency: Optimistic version locking
  assert.match(routeSource, /body\.expectedVersion !== undefined && body\.expectedVersion !== null && body\.expectedVersion !== currentVersion/, "Route must enforce expectedVersion check");
  assert.match(routeSource, /Optimistic concurrency failure/, "Route must return 409 on version mismatch");
  assert.match(routeSource, /version: currentVersion \+ 1/, "Route must increment version on updates");
});
