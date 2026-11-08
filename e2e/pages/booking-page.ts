import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base-page";

export class BookingPage extends BasePage {
  readonly departmentSelect: Locator;
  readonly doctorSelect: Locator;
  readonly slotButton: Locator;
  readonly patientNameInput: Locator;
  readonly patientPhoneInput: Locator;
  readonly submitBookingButton: Locator;
  readonly confirmationNotice: Locator;

  constructor(page: Page) {
    super(page);
    this.departmentSelect = page.locator("select[name='department'], select[aria-label*='Department']");
    this.doctorSelect = page.locator("select[name='provider'], select[name='resource'], select[aria-label*='Doctor']");
    this.slotButton = page.locator("button[data-slot-time], button[aria-label*='slot']").first();
    this.patientNameInput = page.locator("input[placeholder*='Full name'], input[name='patientName']");
    this.patientPhoneInput = page.locator("input[placeholder*='Phone'], input[name='patientPhone']");
    this.submitBookingButton = page.getByRole("button", { name: /confirm booking|book appointment|reserve/i });
    this.confirmationNotice = page.locator("[data-testid='booking-confirmed'], text=/appointment confirmed|booking confirmed/i");
  }

  async navigateToClinic(slug: string) {
    await this.goto(`/book/${slug}`);
    await this.waitForPageReady();
  }

  async bookSlot(patientName: string, phone: string) {
    if (await this.slotButton.isVisible()) {
      await this.slotButton.click();
    }
    if (await this.patientNameInput.isVisible()) {
      await this.patientNameInput.fill(patientName);
    }
    if (await this.patientPhoneInput.isVisible()) {
      await this.patientPhoneInput.fill(phone);
    }
    if (await this.submitBookingButton.isVisible()) {
      await this.submitBookingButton.click();
    }
  }
}
