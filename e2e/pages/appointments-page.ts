import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base-page";

export class AppointmentsPage extends BasePage {
  readonly pageHeading: Locator;
  readonly appointmentsList: Locator;
  readonly statusFilter: Locator;
  readonly approveButton: Locator;
  readonly rescheduleButton: Locator;
  readonly cancelButton: Locator;
  readonly completeButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.getByRole("heading", { name: /appointments|schedule/i });
    this.appointmentsList = page.locator("[data-testid='appointments-list'], table, [data-appointment-id]");
    this.statusFilter = page.locator("select[name='statusFilter'], [data-testid='status-filter']");
    this.approveButton = page.getByRole("button", { name: /approve|confirm/i }).first();
    this.rescheduleButton = page.getByRole("button", { name: /reschedule/i }).first();
    this.cancelButton = page.getByRole("button", { name: /cancel/i }).first();
    this.completeButton = page.getByRole("button", { name: /complete|mark attended/i }).first();
  }

  async navigate() {
    await this.goto("/app/appointments");
    await this.waitForPageReady();
  }

  async filterBy(status: string) {
    if (await this.statusFilter.isVisible()) {
      await this.statusFilter.selectOption(status);
    }
  }

  async performAction(action: "approve" | "reschedule" | "cancel" | "complete") {
    switch (action) {
      case "approve":
        if (await this.approveButton.isVisible()) await this.approveButton.click();
        break;
      case "reschedule":
        if (await this.rescheduleButton.isVisible()) await this.rescheduleButton.click();
        break;
      case "cancel":
        if (await this.cancelButton.isVisible()) await this.cancelButton.click();
        break;
      case "complete":
        if (await this.completeButton.isVisible()) await this.completeButton.click();
        break;
    }
  }
}
