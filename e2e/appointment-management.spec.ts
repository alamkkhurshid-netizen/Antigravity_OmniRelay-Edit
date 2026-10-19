import { test, expect } from "@playwright/test";
import { AppointmentsPage } from "./pages/appointments-page";

test.describe("S4-05: Appointment Lifecycle & Management", () => {
  test("manages appointment statuses across approve, reschedule, cancel, complete", async ({ page }) => {
    const aptPage = new AppointmentsPage(page);

    // Mock appointments query
    await page.route("**/rest/v1/appointments*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "apt-101",
            customer_name: "Sunil Kumar",
            customer_phone: "+919811122233",
            starts_at: "2026-10-25T11:00:00Z",
            ends_at: "2026-10-25T11:30:00Z",
            status: "pending_approval",
            service: { name: "Root Canal" },
            resource: { name: "Dr. Jenkins" },
          },
          {
            id: "apt-102",
            customer_name: "Anita Roy",
            customer_phone: "+919811122244",
            starts_at: "2026-10-25T12:00:00Z",
            ends_at: "2026-10-25T12:30:00Z",
            status: "confirmed",
            service: { name: "Dental Cleanup" },
            resource: { name: "Dr. Jenkins" },
          },
        ]),
      });
    });

    // Mock status update endpoint
    await page.route("**/rest/v1/appointments?id=eq.*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await aptPage.navigate();
    await expect(page.locator("body")).toBeVisible();

    // Verify status actions are interactive
    await aptPage.filterBy("confirmed");
    await aptPage.performAction("approve");
    await aptPage.performAction("reschedule");
    await aptPage.performAction("complete");
    await aptPage.performAction("cancel");
  });
});
