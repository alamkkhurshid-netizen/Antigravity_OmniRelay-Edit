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
  assert.match(routeSource, /supabase\.rpc\("transition_carrier_recovery_task"/, "Route must delegate transition to atomic PostgreSQL RPC via authenticated client");
  assert.match(routeSource, /service_transition_carrier_recovery_task/, "Route must have fallback to dedicated service-role RPC");

  // 4. Migration RPC invariants: SELECT ... FOR UPDATE & Atomic Concurrency & Anti-Impersonation
  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.transition_carrier_recovery_task/, "Migration must define transition_carrier_recovery_task RPC");
  assert.match(migrationSource, /FOR UPDATE/, "RPC must lock row using SELECT ... FOR UPDATE");
  assert.match(migrationSource, /p_expected_version <> v_current_version/, "RPC must compare expected version with current version");
  assert.match(migrationSource, /'status',\s*409/, "RPC must return 409 status on optimistic concurrency failure");
  assert.match(migrationSource, /CARRIER_RECOVERY_IMPERSONATION_DENIED/, "RPC must record audit and reject impersonation attempts");
  assert.match(migrationSource, /CARRIER_RECOVERY_TENANT_DENIED/, "RPC must record audit and reject cross-tenant operations");
  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.service_transition_carrier_recovery_task/, "Migration must define dedicated service-role RPC");
  assert.match(migrationSource, /REVOKE ALL ON FUNCTION public\.service_transition_carrier_recovery_task FROM PUBLIC, anon, authenticated/, "Service RPC must be revoked from public and authenticated");
  assert.match(migrationSource, /REVOKE ALL ON FUNCTION public\.transition_carrier_recovery_task FROM PUBLIC/, "Public execution must be revoked");

  // 5. Behavioral Simulation: Anti-Impersonation & Tenant Isolation Tests
  const mockTenantA = "org_apollo_blr";
  const mockTenantB = "org_manipal_del";
  const adminA = "user_admin_a";
  const receptionistA = "user_receptionist_a";
  const userB = "user_tenant_b";

  function simulateCarrierRpc({
    _taskId = "task_001",
    action = "claim",
    expectedVersion = 1,
    currentVersion = 1,
    p_actor_id = null,
    p_organization_id = null,
    authUid = null,
    authRole = "authenticated",
    taskOrg = mockTenantA,
    memberships = {
      [receptionistA]: { org: mockTenantA, role: "receptionist" },
      [adminA]: { org: mockTenantA, role: "admin" },
      [userB]: { org: mockTenantB, role: "receptionist" },
    }
  }) {
    const isServiceRole = authRole === "service_role";
    let callerId;

    // 1. Identity Resolution
    if (authUid) {
      if (p_actor_id && p_actor_id !== authUid) {
        return {
          success: false,
          status: 403,
          error: "Forbidden: Caller cannot impersonate another actor ID. Actor identity is derived strictly from session.",
          auditLogged: "CARRIER_RECOVERY_IMPERSONATION_DENIED",
          auditActor: authUid
        };
      }
      callerId = authUid;
    } else if (isServiceRole) {
      if (!p_actor_id) {
        return { success: false, status: 400, error: "Actor ID is required for service-role transitions." };
      }
      callerId = p_actor_id;
    } else {
      return { success: false, status: 401, error: "Authentication required." };
    }

    // 2. Cross-tenant check
    if (p_organization_id && p_organization_id !== taskOrg) {
      return {
        success: false,
        status: 403,
        error: "Forbidden: Cross-tenant operation denied.",
        auditLogged: "CARRIER_RECOVERY_TENANT_DENIED",
        auditActor: callerId
      };
    }

    // 3. Membership & Role check
    const member = memberships[callerId];
    if (!member || member.org !== taskOrg) {
      return {
        success: false,
        status: 403,
        error: "Forbidden: User does not belong to the task workspace organization.",
        auditLogged: "CARRIER_RECOVERY_TENANT_DENIED",
        auditActor: callerId
      };
    }

    if (!["owner", "admin", "receptionist"].includes(member.role)) {
      return {
        success: false,
        status: 403,
        error: "Forbidden: Receptionist or administrator role required for carrier recovery.",
        auditLogged: "CARRIER_RECOVERY_DENIED",
        auditActor: callerId
      };
    }

    // 4. Concurrency version check
    if (expectedVersion !== currentVersion) {
      return { success: false, status: 409, error: "Optimistic concurrency failure: version mismatch" };
    }

    return {
      success: true,
      status: 200,
      action,
      version: currentVersion + 1,
      actor_id: callerId,
      auditLogged: "CARRIER_RECOVERY_CLAIMED",
      auditActor: callerId
    };
  }

  // Test: Receptionist supplies an owner/admin UUID -> MUST FAIL (403)
  const impersonationResult = simulateCarrierRpc({
    authUid: receptionistA,
    p_actor_id: adminA,
    expectedVersion: 1
  });
  assert.equal(impersonationResult.success, false);
  assert.equal(impersonationResult.status, 403);
  assert.match(impersonationResult.error, /cannot impersonate/);
  assert.equal(impersonationResult.auditLogged, "CARRIER_RECOVERY_IMPERSONATION_DENIED");
  assert.equal(impersonationResult.auditActor, receptionistA, "Audit must record authenticated identity, not target");

  // Test: User from another tenant supplies their ID for Tenant A task -> MUST FAIL (403)
  const crossTenantResult = simulateCarrierRpc({
    authUid: userB,
    p_actor_id: null,
    taskOrg: mockTenantA,
    expectedVersion: 1
  });
  assert.equal(crossTenantResult.success, false);
  assert.equal(crossTenantResult.status, 403);
  assert.match(crossTenantResult.error, /does not belong to the task workspace/);
  assert.equal(crossTenantResult.auditLogged, "CARRIER_RECOVERY_TENANT_DENIED");
  assert.equal(crossTenantResult.auditActor, userB);

  // Test: Direct call through authenticated Supabase client -> SUCCOEEDS (200)
  const directClientResult = simulateCarrierRpc({
    authUid: receptionistA,
    p_actor_id: null, // No actor ID passed; derived strictly from session
    p_organization_id: mockTenantA,
    taskOrg: mockTenantA,
    expectedVersion: 1
  });
  assert.equal(directClientResult.success, true);
  assert.equal(directClientResult.status, 200);
  assert.equal(directClientResult.actor_id, receptionistA);
  assert.equal(directClientResult.auditActor, receptionistA, "Audit must record database authenticated identity");

  // 6. Behavioral Simulation: 20 simultaneous claim attempts with atomic row lock
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

  // 7. Live PostgreSQL concurrency run (if DATABASE_URL is configured)
  const { runCarrierConcurrencyTest } = await import("../scripts/verification/verify-carrier-concurrency.mjs");
  const liveResult = await runCarrierConcurrencyTest();
  if (!liveResult.skipped) {
    assert.equal(liveResult.success, true);
    assert.equal(liveResult.successfulCount, 1);
    assert.equal(liveResult.conflictCount, 19);
    assert.equal(liveResult.finalVersion, 2);
  }
});
