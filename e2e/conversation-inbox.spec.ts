import { test, expect } from "@playwright/test";
import { InboxPage } from "./pages/inbox-page";

test.describe("S4-06: Conversation Inbox & WhatsApp Messaging", () => {
  test("loads conversations list, selects thread, and dispatches reply", async ({ page }) => {
    const inbox = new InboxPage(page);

    // Mock conversations fetch
    await page.route("**/rest/v1/conversations*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "conv-101",
            contact_address: "+919876543210",
            name: "Rajiv Malhotra",
            status: "active",
            updated_at: "2026-10-25T09:00:00Z",
          },
        ]),
      });
    });

    // Mock messages fetch
    await page.route("**/rest/v1/messages*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "msg-001",
            conversation_id: "conv-101",
            direction: "inbound",
            content: "Hello Doctor, can I get an appointment for tomorrow?",
            timestamp: "2026-10-25T08:55:00Z",
          },
        ]),
      });
    });

    // Mock message sending API
    await page.route("**/api/messages/send", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message_id: "msg-002", status: "sent" }),
      });
    });

    await inbox.navigate();
    await expect(page.locator("body")).toBeVisible();
    await inbox.selectFirstConversation();
    await inbox.sendReply("Yes Rajiv, slots are open at 10 AM and 11:30 AM.");
  });
});
