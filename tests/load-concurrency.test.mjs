import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runWalletLoadTest, runBookingLoadTest } from "../scripts/run-load-tests.mjs";

test("S4-15: load testing framework configuration exists", () => {
  const artilleryConfigPath = path.resolve("tests/load/artillery-booking-and-wallet.yml");
  assert.ok(fs.existsSync(artilleryConfigPath), "Artillery YAML config must exist");
  const configContent = fs.readFileSync(artilleryConfigPath, "utf8");
  assert.match(configContent, /Concurrent Wallet Deduction Load/);
  assert.match(configContent, /Concurrent Booking Requests Load/);
  assert.match(configContent, /\/api\/billing\/deduct/);
  assert.match(configContent, /\/api\/booking\/create/);
});

test("S4-16: 50 concurrent wallet deductions preserve balance and zero race conditions", async () => {
  const initial = 50000; // 50,000 paise = ₹500.00
  const deduction = 399; // 399 paise per deduction
  const count = 50;
  const result = await runWalletLoadTest({
    initialBalancePaise: initial,
    deductionPaise: deduction,
    concurrentRequests: count,
  });

  assert.equal(result.success, true);
  assert.equal(result.deductionsCount, 50);
  assert.equal(result.finalBalancePaise, initial - (count * deduction));
  assert.equal(result.zeroRaceConditions, true);
});

test("S4-17: 100 concurrent booking requests allow exactly 1 reservation and reject 99 collisions", async () => {
  const count = 100;
  const result = await runBookingLoadTest({
    concurrentRequests: count,
  });

  assert.equal(result.success, true);
  assert.equal(result.totalRequests, 100);
  assert.equal(result.successfulBookings, 1, "Only 1 booking can claim the slot");
  assert.equal(result.rejectedCollisions, 99, "99 conflicting bookings must be rejected");
  assert.equal(result.zeroDoubleBookings, true);
});
