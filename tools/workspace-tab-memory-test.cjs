#!/usr/bin/env node

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const {
    conversationHrefFromLocation,
    inspectImportedWorkspaceTabs,
    sanitizeExportedWorkspaceTab,
    workspaceSnapshotHasConversation,
    workspaceTabFingerprint
  } = await import(pathToFileURL(path.join(root, "shared/workspace-tab-memory.js")).href);
  const {
    CONFIG_BUNDLE_KEYS,
    exportConfigBundle,
    inspectImportedConfig
  } = await import(pathToFileURL(path.join(root, "shared/storage-config-bundle.js")).href);

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

  const remembered = sanitizeExportedWorkspaceTab({
    workspaceId: "page-secret",
    title: "Compare models",
    snapshot: {
      schemaVersion: 1,
      generation: "must-not-export",
      layout: { type: "preset", presetId: "default", extra: true },
      groups: [{
        tabs: [{
          appId: "ChatGPT",
          currentHref: "https://chatgpt.com/c/remembered",
          title: "stale"
        }],
        activeIndex: 0,
        extra: true
      }],
      fullscreenGroupIndex: 0,
      topicTitle: "Compare models",
      topicTitleCustom: true
    }
  });
  assert.equal(remembered.title, "Compare models");
  assert.equal(Object.hasOwn(remembered, "workspaceId"), false);
  assert.deepEqual(remembered.snapshot, {
    schemaVersion: 1,
    layout: { type: "preset", presetId: "default" },
    groups: [{
      tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/c/remembered" }],
      activeIndex: 0
    }],
    fullscreenGroupIndex: 0,
    topicTitle: "Compare models",
    topicTitleCustom: true
  });
  assert.equal(sanitizeExportedWorkspaceTab({
    snapshot: {
      schemaVersion: 1,
      groups: [{ tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/" }], activeIndex: 0 }]
    }
  }), null);
  const inspected = inspectImportedWorkspaceTabs([
    remembered,
    { snapshot: { schemaVersion: 1, groups: [] } },
    null
  ]);
  assert.equal(inspected.value.length, 1);
  assert.equal(inspected.droppedCount, 2);
  assert.equal(
    workspaceTabFingerprint(remembered),
    workspaceTabFingerprint({ title: remembered.title, snapshot: remembered.snapshot })
  );
  assert.notEqual(
    workspaceTabFingerprint(remembered),
    workspaceTabFingerprint({
      title: remembered.title,
      snapshot: {
        ...remembered.snapshot,
        groups: [{
          tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/c/other" }],
          activeIndex: 0
        }]
      }
    })
  );

  assert.ok(CONFIG_BUNDLE_KEYS.includes("workspaceTabs"));
  const bundle = exportConfigBundle({ workspaceTabs: [remembered, { snapshot: { schemaVersion: 2 } }] }, ["workspaceTabs"]);
  assert.equal(bundle.schema, "chatclub.config.v1");
  assert.equal(bundle.workspaceTabs.length, 1);
  assert.deepEqual(bundle.workspaceTabs[0].snapshot.groups[0].tabs[0].appId, "ChatGPT");
  const imported = inspectImportedConfig(bundle);
  assert.equal(imported.data.workspaceTabs.length, 1);
  assert.equal(imported.diagnostics.workspaceTabs.droppedCount, 0);
  assert.equal(inspectImportedConfig({ schema: "chatclub.config.v1" }).data.workspaceTabs, null);

  console.log("workspace tab memory: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
