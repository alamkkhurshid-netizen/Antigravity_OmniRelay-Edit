import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("WhatsApp Direct Appointment Messaging & Incoming Notifications Verification", async (t) => {
  await t.test("AppointmentDrawer provides direct WhatsApp chat button and quick messenger modal", () => {
    const drawerPath = path.join(rootDir, "components/appointments/appointment-drawer.tsx");
    assert.ok(fs.existsSync(drawerPath), "AppointmentDrawer must exist");
    const content = fs.readFileSync(drawerPath, "utf-8");

    assert.ok(content.includes("quickChatOpen"), "Drawer must track quickChatOpen state");
    assert.ok(content.includes("WhatsApp Chat") || content.includes("WhatsApp Patient"), "Drawer must offer WhatsApp chat button");
    assert.ok(content.includes("/api/conversations/quick-send"), "Drawer must call quick-send API");
    assert.ok(content.includes("Quick Presets"), "Drawer must offer quick appointment message presets");
    assert.ok(content.includes("/app/conversations?phone="), "Drawer must provide direct link to full chat in inbox");
    assert.ok(content.includes("https://wa.me/"), "Drawer must provide WhatsApp Web backup link");
  });

  await t.test("Quick-send API validates input, normalizes phone, and satisfies messages_content_schema", () => {
    const routePath = path.join(rootDir, "app/api/conversations/quick-send/route.ts");
    assert.ok(fs.existsSync(routePath), "Quick-send route must exist");
    const content = fs.readFileSync(routePath, "utf-8");

    assert.ok(content.includes("cleanPhone"), "Route must normalize phone number");
    assert.ok(content.includes("serviceWindowOpen"), "Route must check 24-hour service window");
    assert.ok(content.includes('type: "text"') && content.includes('type: "data"'), "Route must satisfy messages_content_schema");
    assert.ok(content.includes("channel_connections"), "Route must look up WhatsApp channel connection");
    assert.ok(content.includes("graph.facebook.com"), "Route must dispatch via Meta Cloud API");
  });

  await t.test("Conversations workspace supports deep-linking by phone query parameter", () => {
    const hookPath = path.join(rootDir, "app/app/conversations/use-conversation-workspace.ts");
    const content = fs.readFileSync(hookPath, "utf-8");

    assert.ok(content.includes("useSearchParams"), "Must use useSearchParams to detect deep-link query");
    assert.ok(content.includes("phoneParam"), "Must detect phone query parameter");
    assert.ok(content.includes("setActiveId"), "Must auto-select matched conversation");
  });

  await t.test("System notifications engine reconciles incoming WhatsApp messages", () => {
    const sysNotifPath = path.join(rootDir, "lib/system-notifications.ts");
    const content = fs.readFileSync(sysNotifPath, "utf-8");

    assert.ok(content.includes("incoming_whatsapp_message"), "Must reconcile incoming WhatsApp messages");
    assert.ok(content.includes("getUnreadConversationsCount"), "Must provide unread conversations count function");
    assert.ok(content.includes("export async function getUnreadConversationsCount"), "getUnreadConversationsCount must be exported");
  });

  await t.test("Notifications API returns unreadConversations count", () => {
    const notifRoutePath = path.join(rootDir, "app/api/notifications/route.ts");
    const content = fs.readFileSync(notifRoutePath, "utf-8");

    assert.ok(content.includes("getUnreadConversationsCount"), "API must call getUnreadConversationsCount");
    assert.ok(content.includes("unreadConversations:"), "API must return unreadConversations in JSON payload");
  });

  await t.test("AppShell sidebar renders emerald notification badge for Conversations", () => {
    const appShellPath = path.join(rootDir, "components/app-shell.tsx");
    const content = fs.readFileSync(appShellPath, "utf-8");

    assert.ok(content.includes("unreadConversations"), "AppShell must track unreadConversations state");
    assert.ok(content.includes('/app/conversations" && unreadConversations > 0'), "AppShell must render badge when unreadConversations > 0");
    assert.ok(content.includes("bg-[#059669]"), "Conversations badge must use emerald green badge styling");
  });

  await t.test("Database migration creates instant trigger for incoming WhatsApp messages", () => {
    const migrationPath = path.join(rootDir, "supabase/migrations/20261122220000_incoming_whatsapp_notifications.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
    const content = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(content.includes("notify_incoming_whatsapp_message"), "Must define trigger function");
    assert.ok(content.includes("trg_notify_incoming_whatsapp_message"), "Must define trigger on messages table");
    assert.ok(content.includes("incoming_whatsapp_message"), "Must set entity_type to incoming_whatsapp_message");
  });
});
