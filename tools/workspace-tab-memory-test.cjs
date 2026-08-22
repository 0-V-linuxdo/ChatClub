#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const {
    conversationHrefFromLocation,
    workspaceSnapshotHasConversation
  } = await import(pathToFileURL(path.join(root, "shared/workspace-tab-memory.js")).href);

  assert.equal(conversationHrefFromLocation("https://chatgpt.com/c/thread-1"), "https://chatgpt.com/c/thread-1");
  assert.equal(conversationHrefFromLocation("https://chatgpt.com/g/g-abc/c/thread-2"), "https://chatgpt.com/g/g-abc/c/thread-2");
  assert.equal(conversationHrefFromLocation("https://chat.openai.com/"), "");
  assert.equal(conversationHrefFromLocation("https://claude.ai/chat/abc"), "https://claude.ai/chat/abc");
  assert.equal(conversationHrefFromLocation("https://claude.ai/new"), "");
  assert.equal(conversationHrefFromLocation("https://gemini.google.com/app/xyz"), "https://gemini.google.com/app/xyz");
  assert.equal(conversationHrefFromLocation("https://gemini.google.com/app"), "");
  assert.equal(conversationHrefFromLocation("https://assistant.kagi.com/chat/1"), "https://assistant.kagi.com/chat/1");
  assert.equal(conversationHrefFromLocation("https://app.notion.com/chat?t=topic-1"), "https://app.notion.com/chat?t=topic-1");
  assert.equal(conversationHrefFromLocation("https://app.notion.com/ai"), "");
  assert.equal(conversationHrefFromLocation("https://grok.com/c/abc"), "https://grok.com/c/abc");
  assert.equal(conversationHrefFromLocation("https://chat.deepseek.com/a/chat/s/abc"), "https://chat.deepseek.com/a/chat/s/abc");
  assert.equal(conversationHrefFromLocation("https://custom.example/thread/9"), "https://custom.example/thread/9");
  assert.equal(conversationHrefFromLocation("https://custom.example/"), "");
  assert.equal(conversationHrefFromLocation("chrome-extension://chatclub/chatClub.html"), "");

  assert.equal(workspaceSnapshotHasConversation({
    groups: [{ tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/" }] }]
  }), false);
  assert.equal(workspaceSnapshotHasConversation({
    groups: [{ tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/c/remembered" }] }]
  }), true);
  assert.equal(workspaceSnapshotHasConversation({
    groups: [
      { tabs: [{ appId: "Claude", currentHref: "https://claude.ai/new" }] },
      { tabs: [{ appId: "Grok", currentHref: "https://grok.com/chat/abc" }] }
    ]
  }), true);
  assert.equal(workspaceSnapshotHasConversation({ groups: [] }), false);
  assert.equal(workspaceSnapshotHasConversation(null), false);

  console.log("workspace tab memory: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
