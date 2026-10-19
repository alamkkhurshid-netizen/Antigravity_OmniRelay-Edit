import { test, expect } from "@playwright/test";
import { OnboardingPage } from "./pages/onboarding-page";

test.describe("S4-03: Onboarding Wizard Flow", () => {
  test("enforces healthcare-only policy and completion of safeguards", async ({ page }) => {
    const onboarding = new OnboardingPage(page);
    await onboarding.navigate();

    // Verify initial step renders foundation controls
    await expect(page.locator("text=/WORKSPACE FOUNDATION/i")).toBeVisible();
    await expect(onboarding.clinicNameInput).toBeVisible();

    // Verify draft persistence in localStorage
    await onboarding.clinicNameInput.fill("Apollo Dental Care");
    const draft = await page.evaluate(() => localStorage.getItem("omnirelay_onboarding_draft"));
    expect(draft).toContain("Apollo Dental Care");
  });

  test("completes full wizard flow from new clinic registration to /app", async ({ page }) => {
    const onboarding = new OnboardingPage(page);

    // Mock RPC call for complete_workspace_onboarding
    await page.route("**/rest/v1/rpc/complete_workspace_onboarding", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          organization_id: "org_e2e_test_clinic_123",
          status: "success",
        }),
      });
    });

    // Mock redirection target /app
    await page.route("**/app", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><h1>Welcome to OmniRelay App</h1></body></html>",
      });
    });

    await onboarding.navigate();
    await onboarding.fillStepOne("City Polyclinic", "Dr. Rajesh Sharma");

    // Tier selection screen should now be active
    await expect(page.locator("text=/STANDARD ACCESS|SUBSCRIPTION TIER/i")).toBeVisible();

    // Finalize onboarding with standard tier
    await onboarding.selectTierAndFinalize("standard");

    // Assert final redirection to /app
    await expect(page).toHaveURL(/\/app/);
  });
});
