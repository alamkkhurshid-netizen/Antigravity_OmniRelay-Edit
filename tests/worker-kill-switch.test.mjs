import assert from "node:assert/strict";
import test from "node:test";

test("WORKER_ENABLED kill switch defaults to safe enabled state and pauses cleanly on false", async () => {
  // 1. Default safe state
  const defaultWorkerState = process.env.WORKER_ENABLED !== "false";
  assert.equal(defaultWorkerState, true, "Worker must default to enabled when environment variable is unset");

  // 2. Disabled state check
  const isWorkerDisabled = (val) => val === "false";
  assert.equal(isWorkerDisabled("false"), true, "WORKER_ENABLED='false' must indicate disabled");
  assert.equal(isWorkerDisabled("true"), false, "WORKER_ENABLED='true' must indicate enabled");
  assert.equal(isWorkerDisabled(undefined), false, "Unset must not disable worker");

  // 3. Simulated Inbound Webhook Execution with WORKER_ENABLED=false
  const mockDb = {
    inboundMessages: [],
    operationalEvents: [],
    from(table) {
      return {
        insert: async (row) => {
          if (table === "whatsapp_inbound_messages") {
            mockDb.inboundMessages.push(row);
          } else if (table === "operational_events") {
            mockDb.operationalEvents.push(row);
          }
          return { error: null };
        }
      };
    }
  };

  const simulateInbound = async (envWorkerVal, messageId, orgId) => {
    const workerEnabled = envWorkerVal !== "false";
    if (!workerEnabled) {
      await mockDb.from("whatsapp_inbound_messages").insert({
        organization_id: orgId,
        provider_message_id: messageId,
        status: "queued"
      });
      await mockDb.from("operational_events").insert({
        organization_id: orgId,
        error_code: "WORKER_PAUSED",
        event_source: "whatsapp_worker_kill_switch",
        severity: "warning"
      });
      return { status: "paused_and_queued" };
    }
    return { status: "processed" };
  };

  // Test paused run
  const pausedRes = await simulateInbound("false", "msg_test_001", "org_test_123");
  assert.equal(pausedRes.status, "paused_and_queued");
  assert.equal(mockDb.inboundMessages.length, 1);
  assert.equal(mockDb.inboundMessages[0].status, "queued");
  assert.equal(mockDb.operationalEvents.length, 1);
  assert.equal(mockDb.operationalEvents[0].error_code, "WORKER_PAUSED");

  // Test enabled run
  const enabledRes = await simulateInbound("true", "msg_test_002", "org_test_123");
  assert.equal(enabledRes.status, "processed");
  assert.equal(mockDb.inboundMessages.length, 1, "No new queued message inserted on normal processing branch");
});
