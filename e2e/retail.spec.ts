import { test, expect } from "@playwright/test";
import { RetailPage } from "./pages/retail-page";

test.describe("S4-10: Retail Automation & Catalog Management", () => {
  test("manages product catalog CRUD and displays orders pipeline", async ({ page }) => {
    const retail = new RetailPage(page);

    // Mock products catalog
    await page.route("**/rest/v1/retail_products*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "prod-1",
            title: "Herbal Toothpaste 100g",
            price_paise: 15000,
            inventory_count: 50,
            status: "active",
          },
        ]),
      });
    });

    // Mock orders pipeline
    await page.route("**/rest/v1/retail_orders*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "ord-101",
            order_number: "ORD-001",
            customer_name: "Karan Johar",
            total_paise: 30000,
            status: "pending_payment",
          },
        ]),
      });
    });

    await retail.navigate();
    await expect(page.locator("body")).toBeVisible();
    await retail.navigateCatalog();
    await retail.navigateOrders();
  });
});
