import { test, expect } from "@playwright/test";
import { BookingPage } from "./pages/booking-page";

test.describe("S4-04: Public Patient Booking Flow", () => {
  test("renders public booking page for clinic slug and confirms slot reservation", async ({ page }) => {
    const bookingPage = new BookingPage(page);

    // Mock clinic public booking page metadata
    await page.route("**/rest/v1/rpc/get_public_booking_page*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          organization_id: "org_e2e_clinic",
          business_name: "Apex Healthcare Clinic",
          slug: "apex-clinic",
          services: [
            { id: "srv-01", name: "General Consultation", duration_minutes: 30, price_paise: 50000 },
          ],
          resources: [
            { id: "res-01", name: "Dr. A. Verma", resource_type: "Doctor" },
          ],
          available_slots: [
            { starts_at: "2026-10-25T10:00:00Z", ends_at: "2026-10-25T10:30:00Z" },
            { starts_at: "2026-10-25T10:30:00Z", ends_at: "2026-10-25T11:00:00Z" },
          ],
        }),
      });
    });

    // Mock appointment creation POST
    await page.route("**/api/booking/create", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          appointment_id: "apt_e2e_999",
          status: "confirmed",
          booking_reference: "OMNI-9991",
        }),
      });
    });

    await bookingPage.navigateToClinic("apex-clinic");
    await expect(page.locator("text=/Apex Healthcare Clinic|Book an appointment/i")).toBeVisible();

    await bookingPage.bookSlot("Rohan Gupta", "+919876543210");
  });
});
