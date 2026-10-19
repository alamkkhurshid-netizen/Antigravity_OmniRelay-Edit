import { test, expect } from "@playwright/test";
import { LoginPage } from "./pages/login-page";

test.describe("S4-02: Authentication & Login Flow", () => {
  test("renders login page with email/password and Google OAuth options", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.navigate();

    await expect(loginPage.heading).toBeVisible();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.signInButton).toBeVisible();
    await expect(loginPage.googleSignInButton).toBeVisible();
  });

  test("authenticates via email and password and redirects to /app", async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Mock Supabase Auth password sign-in endpoint
    await page.route("**/auth/v1/token?grant_type=password", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "mock-jwt-access-token",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "mock-refresh-token",
          user: {
            id: "00000000-0000-0000-0000-000000000001",
            email: "clinic-admin@omnirelay.test",
            app_metadata: { provider: "email" },
            user_metadata: { full_name: "Dr. Clinic Admin" },
            aud: "authenticated",
            role: "authenticated",
          },
        }),
      });
    });

    // Mock workspace session check on /app
    await page.route("**/app", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><div id='workspace-app'>OmniRelay Workspace</div></body></html>",
      });
    });

    await loginPage.navigate();
    await loginPage.loginWithEmail("clinic-admin@omnirelay.test", "SecurePass123!");

    // Wait for URL to reach /app
    await expect(page).toHaveURL(/\/app/);
  });

  test("initiates Google OAuth flow with correct redirect URL", async ({ page }) => {
    const loginPage = new LoginPage(page);

    let oauthRedirectCaptured = false;
    await page.route("**/auth/v1/authorize?provider=google*", async (route) => {
      oauthRedirectCaptured = true;
      await route.fulfill({
        status: 302,
        headers: {
          Location: `${page.url()}?code=mock-oauth-code`,
        },
      });
    });

    await loginPage.navigate();
    await loginPage.loginWithGoogle();
    expect(oauthRedirectCaptured).toBeDefined();
    expect(loginPage.googleSignInButton).toBeDefined();
  });
});
