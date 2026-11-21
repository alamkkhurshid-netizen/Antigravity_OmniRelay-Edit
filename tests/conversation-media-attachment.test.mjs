import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("Conversation & Campaign: Media Attachment & Direct File Upload Verification", async (t) => {
  await t.test("Conversation reply route supports media attachments (image and document)", () => {
    const replyRoutePath = path.join(rootDir, "app/api/conversations/reply/route.ts");
    assert.ok(fs.existsSync(replyRoutePath), "Reply route must exist");
    const content = fs.readFileSync(replyRoutePath, "utf-8");

    assert.ok(content.includes("mediaUrl"), "Reply route must accept mediaUrl");
    assert.ok(content.includes("mediaType"), "Reply route must accept mediaType");
    assert.ok(content.includes("messaging_product"), "Reply route must send to Meta WhatsApp API");
    assert.ok(
      content.includes('type: "document"') || content.includes('metaPayload.type = mediaType'),
      "Reply route must construct Meta media payload"
    );
  });

  await t.test("Conversation reply content strictly complies with messages_content_schema constraint", () => {
    const replyRoutePath = path.join(rootDir, "app/api/conversations/reply/route.ts");
    const content = fs.readFileSync(replyRoutePath, "utf-8");

    // messages_content_schema requires ("content" ->> 'type') = ANY (ARRAY['text', 'file', 'data'])
    assert.ok(
      content.includes('type: mediaUrl ? "file" : "text"'),
      "Message content type must be strictly 'file' or 'text' to satisfy messages_content_schema"
    );
    assert.ok(
      content.includes('kind: mediaType || "text"'),
      "Message content kind must identify the media flavor (image, document, text)"
    );
  });

  await t.test("Upload route enables PDF support and fallback", () => {
    const uploadRoutePath = path.join(rootDir, "app/api/campaigns/upload/route.ts");
    assert.ok(fs.existsSync(uploadRoutePath), "Upload route must exist");
    const content = fs.readFileSync(uploadRoutePath, "utf-8");

    assert.ok(content.includes("application/pdf"), "Upload route must allow application/pdf");
    assert.ok(content.includes("updateBucket"), "Upload route must attempt to update allowed mime types");
    assert.ok(content.includes("clinical-documents"), "Upload route must include fallback bucket for documents");
  });

  await t.test("ThreadView component activates Paperclip attachment button", () => {
    const threadViewPath = path.join(rootDir, "components/conversations/thread-view.tsx");
    assert.ok(fs.existsSync(threadViewPath), "ThreadView component must exist");
    const content = fs.readFileSync(threadViewPath, "utf-8");

    // Paperclip button should not have disabled or opacity-50 title="Attachments are not enabled"
    assert.ok(!content.includes('title="Attachments are not enabled"'), "Paperclip must not be marked disabled");
    assert.ok(content.includes("attachmentInputRef"), "ThreadView must have attachment file input ref");
    assert.ok(content.includes("handleFileChange"), "ThreadView must handle attachment file selection");
    assert.ok(content.includes("uploadingAttachment"), "ThreadView must display upload progress state");
  });

  await t.test("Campaign Workspace provides direct file upload & auto-purge notice", () => {
    const campaignWorkspacePath = path.join(rootDir, "app/app/campaigns/campaign-workspace.tsx");
    assert.ok(fs.existsSync(campaignWorkspacePath), "Campaign workspace must exist");
    const content = fs.readFileSync(campaignWorkspacePath, "utf-8");

    assert.ok(content.includes("handleMediaUpload"), "Must include direct media upload handler");
    assert.ok(content.includes("Upload Image or PDF from Computer"), "Must provide direct file upload button");
    assert.ok(content.includes("Auto-purged post-dispatch"), "Must display auto-purge badge");
    assert.ok(content.includes("storagePath"), "Must store storagePath for post-dispatch cleanup");
  });

  await t.test("Campaign Dispatcher executes auto-cleanup of temporary media post dispatch", () => {
    const dispatcherPath = path.join(rootDir, "lib/campaign-dispatcher.ts");
    assert.ok(fs.existsSync(dispatcherPath), "Campaign dispatcher must exist");
    const content = fs.readFileSync(dispatcherPath, "utf-8");

    assert.ok(content.includes("storagePath"), "Dispatcher must check audience_filter storagePath");
    assert.ok(
      content.includes('.from(bucket).remove('),
      "Dispatcher must purge uploaded media from storage bucket after dispatch completes"
    );
  });
});
