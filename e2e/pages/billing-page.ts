import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base-page";

export class BillingPage extends BasePage {
  readonly pageHeading: Locator;
  readonly walletBalanceCard: Locator;
  readonly topUpButton: Locator;
  readonly topUpModal: Locator;
  readonly amountInput: Locator;
  readonly initiatePaymentButton: Locator;
  readonly razorpayModal: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.getByRole("heading", { name: /current access|billing|wallet/i });
    this.walletBalanceCard = page.locator("[data-testid='wallet-card'], text=/₹/").first();
    this.topUpButton = page.getByRole("button", { name: /top up|recharge|add funds/i }).first();
    this.topUpModal = page.locator("[role='dialog'], [data-testid='topup-modal']");
    this.amountInput = page.locator("input[name='amount'], input[placeholder*='amount'], input[type='number']");
    this.initiatePaymentButton = page.getByRole("button", { name: /pay with razorpay|proceed to payment|recharge now/i });
    this.razorpayModal = page.locator(".razorpay-checkout-frame, iframe[name*='razorpay']");
  }

  async navigate() {
    await this.goto("/app/billing");
    await this.waitForPageReady();
  }

  async openTopUpModal() {
    if (await this.topUpButton.isVisible()) {
      await this.topUpButton.click();
    }
  }
}
