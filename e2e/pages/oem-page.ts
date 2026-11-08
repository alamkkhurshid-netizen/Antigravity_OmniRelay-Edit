import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base-page";

export class OemPage extends BasePage {
  readonly pageHeading: Locator;
  readonly tenantTable: Locator;
  readonly tenantRows: Locator;
  readonly suspendToggle: Locator;
  readonly activateToggle: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.getByRole("heading", { name: /platform overview|tenant directory|oem/i });
    this.tenantTable = page.locator("table, [data-testid='tenant-list']");
    this.tenantRows = page.locator("tbody tr, [data-tenant-id]");
    this.suspendToggle = page.getByRole("button", { name: /suspend|pause/i }).first();
    this.activateToggle = page.getByRole("button", { name: /activate|resume/i }).first();
  }

  async navigate() {
    await this.goto("/oem");
    await this.waitForPageReady();
  }

  async navigateTenants() {
    await this.goto("/oem/tenants");
    await this.waitForPageReady();
  }
}
