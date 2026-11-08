import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base-page";

export class RetailPage extends BasePage {
  readonly pageHeading: Locator;
  readonly openOrderPipelineButton: Locator;
  readonly catalogLink: Locator;
  readonly addProductButton: Locator;
  readonly productNameInput: Locator;
  readonly productPriceInput: Locator;
  readonly saveProductButton: Locator;
  readonly orderList: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.getByRole("heading", { name: /retail automation|orders|catalog/i });
    this.openOrderPipelineButton = page.getByRole("link", { name: /open order pipeline/i });
    this.catalogLink = page.getByRole("link", { name: /catalog/i });
    this.addProductButton = page.getByRole("button", { name: /add product|new product/i });
    this.productNameInput = page.locator("input[name='title'], input[placeholder*='Product name']");
    this.productPriceInput = page.locator("input[name='price'], input[placeholder*='Price']");
    this.saveProductButton = page.getByRole("button", { name: /save product|create item/i });
    this.orderList = page.locator("[data-testid='order-pipeline'], table, .divide-y");
  }

  async navigate() {
    await this.goto("/app/retail");
    await this.waitForPageReady();
  }

  async navigateCatalog() {
    await this.goto("/app/retail/catalog");
    await this.waitForPageReady();
  }

  async navigateOrders() {
    await this.goto("/app/retail/orders");
    await this.waitForPageReady();
  }
}
