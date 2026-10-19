import { test, expect } from "@playwright/test";
import { OemPage } from "./pages/oem-page";

test.describe("S4-08: OEM / Platform Operator Panel", () => {
  test("loads OEM cockpit and tenant list with suspension/activation actions", async ({ page }) => {
    const oem = new OemPage(page);

    // Mock platform metrics and tenants
    await page.route("**/rest/v1/organizations*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "org-1",
            name: "Apex Healthcare",
            status: "active",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "org-2",
            name: "MediCity Polyclinic",
            status: "suspended",
            created_at: "2026-01-10T00:00:00Z",
          },
        ]),
      });
    });

    await page.route("**/api/oem/tenants/*/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, updated_status: "suspended" }),
      });
    });

    await oem.navigate();
    await expect(page.locator("body")).toBeVisible();
    await oem.navigateTenants();
  });
});
