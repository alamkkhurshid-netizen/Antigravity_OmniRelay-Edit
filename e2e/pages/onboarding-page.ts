import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base-page";

export class OnboardingPage extends BasePage {
  readonly clinicNameInput: Locator;
  readonly doctorNameInput: Locator;
  readonly confirmHealthcareCheckbox: Locator;
  readonly confirmSingleProfileCheckbox: Locator;
  readonly continueButton: Locator;
  readonly standardTierButton: Locator;
  readonly premiumTierButton: Locator;
  readonly finalizeButton: Locator;

  constructor(page: Page) {
    super(page);
    this.clinicNameInput = page.locator("input[placeholder*='Clinic']");
    this.doctorNameInput = page.locator("input[placeholder*='Doctor'], input[placeholder*='Sarah']");
    this.confirmHealthcareCheckbox = page.locator("input[type='checkbox']").first();
    this.confirmSingleProfileCheckbox = page.locator("input[type='checkbox']").nth(1);
    this.continueButton = page.getByRole("button", { name: /continue/i });
    this.standardTierButton = page.getByRole("button", { name: /standard/i });
    this.premiumTierButton = page.getByRole("button", { name: /clinic pro|premium/i });
    this.finalizeButton = page.getByRole("button", { name: /confirm & launch|activate|get started/i });
  }

  async navigate() {
    await this.goto("/onboarding");
    await this.waitForPageReady();
  }

  async fillStepOne(clinicName: string, doctorName: string) {
    await this.clinicNameInput.fill(clinicName);
    await this.doctorNameInput.fill(doctorName);
    await this.confirmHealthcareCheckbox.check();
    await this.confirmSingleProfileCheckbox.check();
    await this.continueButton.click();
  }

  async selectTierAndFinalize(tier: "standard" | "premium" = "standard") {
    if (tier === "standard") {
      await this.standardTierButton.click();
    } else {
      await this.premiumTierButton.click();
    }
  }
}
