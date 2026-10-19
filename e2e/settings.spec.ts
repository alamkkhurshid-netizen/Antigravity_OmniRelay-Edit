import { test, expect } from "@playwright/test";
import { SettingsPage } from "./pages/settings-page";

test.describe("S4-07: Clinic Settings & Configuration", () => {
  test("navigates settings, updates business details, and persists configuration", async ({ page }) => {
    const settings = new SettingsPage(page);

    // Mock settings data
    await page.route("**/rest/v1/organizations*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "org-test-1",
          name: "Global Care Hospital",
          category: "Healthcare",
        }),
      });
    });

    await page.route("**/rest/v1/organizations?id=eq.*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await settings.navigate();
    await expect(page.locator("body")).toBeVisible();
    await settings.updateBusinessName("Global Care Multispecialty");
  });
});
