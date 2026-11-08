import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base-page";

export class SettingsPage extends BasePage {
  readonly pageHeading: Locator;
  readonly businessNameInput: Locator;
  readonly saveButton: Locator;
  readonly servicesTab: Locator;
  readonly availabilityTab: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.getByRole("heading", { name: /settings|clinic profile/i });
    this.businessNameInput = page.locator("input[name='businessName'], input[id='name']");
    this.saveButton = page.getByRole("button", { name: /save|update/i }).first();
    this.servicesTab = page.getByRole("tab", { name: /services/i }).or(page.getByRole("link", { name: /services/i }));
    this.availabilityTab = page.getByRole("tab", { name: /availability|hours/i }).or(page.getByRole("link", { name: /availability/i }));
    this.successMessage = page.locator("text=/saved|updated successfully|persisted/i");
  }

  async navigate() {
    await this.goto("/app/settings");
    await this.waitForPageReady();
  }

  async updateBusinessName(name: string) {
    if (await this.businessNameInput.isVisible()) {
      await this.businessNameInput.fill(name);
      await this.saveButton.click();
    }
  }
}
