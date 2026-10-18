import { Page, Locator } from "@playwright/test";

export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(path: string) {
    await this.page.goto(path);
  }

  async waitForPageReady() {
    await this.page.waitForLoadState("domcontentloaded");
  }

  async getHeading(text: string): Promise<Locator> {
    return this.page.getByRole("heading", { name: text });
  }
}
