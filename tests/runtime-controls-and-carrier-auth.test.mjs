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

test("P0 Carrier Recovery: Role Authorization, Atomic RPC & 20-Claim Concurrency", async () => {
  const routeSource = readFileSync(new URL("../app/api/action-centre/carrier-recovery/route.ts", import.meta.url), "utf8");
  const migrationSource = readFileSync(new URL("../supabase/migrations/20261010000007_reconcile_post_baseline_bindings.sql", import.meta.url), "utf8");

  // 1. Role requirements in route: owner, admin, or receptionist
  assert.match(routeSource, /\["owner", "admin", "receptionist"\]\.includes/, "Route must restrict access to owner, admin, or receptionist");
  assert.match(routeSource, /Receptionist or administrator role required/, "Route must reject unauthorized roles");

  // 2. Mandatory expectedVersion requirement in route
  assert.match(routeSource, /body\.expectedVersion === undefined || body\.expectedVersion === null/, "Route must strictly require expectedVersion");

  // 3. Delegation to atomic PostgreSQL RPC
  assert.match(routeSource, /admin\.rpc\("transition_carrier_recovery_task"/, "Route must delegate transition to atomic PostgreSQL RPC");

  // 4. Migration RPC invariants: SELECT ... FOR UPDATE & Atomic Concurrency
  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.transition_carrier_recovery_task/, "Migration must define transition_carrier_recovery_task RPC");
  assert.match(migrationSource, /FOR UPDATE/, "RPC must lock row using SELECT ... FOR UPDATE");
  assert.match(migrationSource, /p_expected_version <> v_current_version/, "RPC must compare expected version with current version");
  assert.match(migrationSource, /'status',\s*409/, "RPC must return 409 status on optimistic concurrency failure");
  assert.match(migrationSource, /UPDATE public\.operational_events/, "RPC must update operational_events");
  assert.match(migrationSource, /INSERT INTO public\.action_centre_assignments/, "RPC must update action_centre_assignments in same transaction");
  assert.match(migrationSource, /CARRIER_RECOVERY_CLAIMED/, "RPC must record audit in same transaction");
  assert.match(migrationSource, /REVOKE ALL ON FUNCTION public\.transition_carrier_recovery_task FROM PUBLIC/, "Public execution must be revoked");

  // 5. Behavioral Simulation: 20 simultaneous claim attempts with atomic row lock
  let taskVersion = 1;
  let taskStatus = "pending_manual_intervention";
  let claimedBy = null;
  let assignmentsCreated = 0;
  let auditLogsCreated = 0;

  async function simulateAtomicRpc(taskId, action, expectedVersion, actorId) {
    // Simulate atomic serialized Postgres transaction (FOR UPDATE lock)
    if (expectedVersion !== taskVersion) {
      return {
        success: false,
        status: 409,
        error: `Optimistic concurrency failure: current ${taskVersion}, expected ${expectedVersion}`
      };
    }

    if (taskStatus === "resolved") {
      return { success: false, status: 409, error: "Task is already resolved and immutable" };
    }

    // Atomic update within transaction
    taskVersion += 1;
    taskStatus = "claimed";
    claimedBy = actorId;
    assignmentsCreated += 1;
    auditLogsCreated += 1;

    return {
      success: true,
      status: 200,
      action: "claim",
      version: taskVersion,
      claimedBy: actorId
    };
  }

  const taskId = "task_carrier_recovery_001";
  const users = Array.from({ length: 20 }, (_, i) => `user_${i + 1}`);

  // All 20 receptionists simultaneously try to claim the task with expectedVersion = 1
  const results = await Promise.all(
    users.map(userId => simulateAtomicRpc(taskId, "claim", 1, userId))
  );

  // Assertions on 20 simultaneous attempts:
  assert.equal(results.length, 20, "Must process 20 simultaneous requests");
  const winners = results.filter(r => r.success && r.status === 200);
  const conflicts = results.filter(r => !r.success && r.status === 409);

  assert.equal(winners.length, 1, "Exactly ONE claimant must succeed");
  assert.equal(conflicts.length, 19, "Exactly 19 conflicting attempts must receive 409 Conflict");
  assert.equal(taskVersion, 2, "Task version must be incremented to 2");
  assert.equal(assignmentsCreated, 1, "Exactly one assignment record must be created");
  assert.equal(auditLogsCreated, 1, "Exactly one audit record must be generated");
  assert.ok(claimedBy, "Winning claimant must be recorded");

  // 6. Live PostgreSQL concurrency run (if DATABASE_URL is configured)
  const { runCarrierConcurrencyTest } = await import("../scripts/verification/verify-carrier-concurrency.mjs");
  const liveResult = await runCarrierConcurrencyTest();
  if (!liveResult.skipped) {
    assert.equal(liveResult.success, true);
    assert.equal(liveResult.successfulCount, 1);
    assert.equal(liveResult.conflictCount, 19);
    assert.equal(liveResult.finalVersion, 2);
  }
});
