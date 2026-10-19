import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base-page";

export class LoginPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly googleSignInButton: Locator;
  readonly errorMessage: Locator;
  readonly heading: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator("input#email");
    this.passwordInput = page.locator("input#password");
    this.signInButton = page.getByRole("button", { name: "Sign in" });
    this.googleSignInButton = page.getByRole("button", { name: /continue with google/i });
    this.errorMessage = page.locator(".text-rose-600");
    this.heading = page.getByRole("heading", { name: /sign in to your workspace/i });
  }

  async navigate() {
    await this.goto("/login");
    await this.waitForPageReady();
  }

  async loginWithEmail(email: string, pass: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(pass);
    await this.signInButton.click();
  }

  async loginWithGoogle() {
    await this.googleSignInButton.click();
  }
}
