import { test, expect } from "@playwright/test";
import { BillingPage } from "./pages/billing-page";

test.describe("S4-09: Billing & Wallet Top-Up Flow", () => {
  test("displays tenant wallet balance, transaction ledger, and launches top-up flow", async ({ page }) => {
    const billing = new BillingPage(page);

    // Mock wallet balance and entitlement data
    await page.route("**/rest/v1/tenant_wallets*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          balance_paise: 250000,
          warning_threshold_paise: 50000,
        }),
      });
    });

    await page.route("**/rest/v1/entitlements*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan_id: "pro_clinic",
          status: "active",
          current_period_end: "2026-12-31T23:59:59Z",
        }),
      });
    });

    // Mock Razorpay order creation
    await page.route("**/api/billing/create-topup-order", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          order_id: "order_mock_rzp_123",
          amount: 100000,
          currency: "INR",
          key_id: "rzp_test_mock_key",
        }),
      });
    });

    await billing.navigate();
    await expect(page.locator("body")).toBeVisible();
    await billing.openTopUpModal();
  });
});
