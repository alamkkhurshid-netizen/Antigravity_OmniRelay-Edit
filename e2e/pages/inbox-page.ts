import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base-page";

export class InboxPage extends BasePage {
  readonly pageHeading: Locator;
  readonly conversationList: Locator;
  readonly firstConversationItem: Locator;
  readonly messageThread: Locator;
  readonly replyTextarea: Locator;
  readonly sendButton: Locator;
  readonly templateButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageHeading = page.getByRole("heading", { name: /conversations|inbox/i });
    this.conversationList = page.locator("[data-testid='conversation-list'], [role='listbox'], ul.divide-y");
    this.firstConversationItem = page.locator("[data-conversation-id], [role='option'], li[data-active]").first();
    this.messageThread = page.locator("[data-testid='message-thread'], [data-testid='chat-stream']");
    this.replyTextarea = page.locator("textarea[placeholder*='message'], textarea[name='reply']");
    this.sendButton = page.getByRole("button", { name: /send/i });
    this.templateButton = page.getByRole("button", { name: /template/i });
  }

  async navigate() {
    await this.goto("/app/conversations");
    await this.waitForPageReady();
  }

  async selectFirstConversation() {
    if (await this.firstConversationItem.isVisible()) {
      await this.firstConversationItem.click();
    }
  }

  async sendReply(message: string) {
    if (await this.replyTextarea.isVisible()) {
      await this.replyTextarea.fill(message);
      await this.sendButton.click();
    }
  }
}
