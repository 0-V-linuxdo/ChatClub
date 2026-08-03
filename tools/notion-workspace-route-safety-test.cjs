#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { createWorkspacePocketController } = await import("../app/workspace/pocket-controller.js");

  const apps = [
    {
      id: "NotionAI",
      name: "Notion AI",
      source: "builtin",
      chatAppSource: "builtin",
      url: "https://app.notion.com/ai",
      hosts: ["app.notion.com"]
    },
    {
      id: "CustomNotion",
      name: "Custom Notion",
      source: "custom",
      chatAppSource: "custom",
      url: "https://app.notion.com/custom",
      hosts: ["app.notion.com"]
    }
  ];
  const state = {
    groups: [],
    activeTabs: {},
    fullscreenGroupId: null,
    temporaryLayoutPreset: null
  };
  let frameSequence = 0;
  let groupSequence = 0;
  let remembered = 0;
  let rendered = 0;
  let assignedHref = "";
  const controller = createWorkspacePocketController({
    state,
    services: {
      allApps: () => apps,
      appById: (id) => apps.find((app) => app.id === id) || apps[0],
      createFrameId: () => `frame-${++frameSequence}`,
      createGroupId: () => `group-${++groupSequence}`,
      createLayoutId: () => "temporary-layout",
      openableTabUrl: (value) => {
        try {
          const parsed = new URL(String(value || ""));
          return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
        } catch {
          return "";
        }
      },
      render: () => { rendered += 1; }
    },
    registry: {
      frameApp: (iframe) => apps.find((app) => app.id === iframe?.dataset?.appId) || null
    },
    session: { rememberWorkspaceSession: () => { remembered += 1; } },
    layout: { validChatAppIds: () => new Set(apps.map((app) => app.id)) },
    frame: {
      activateChatTab: () => {},
      assignFrameSrc: (_iframe, href) => {
        assignedHref = href;
        return true;
      }
    }
  });

  assert.equal(await controller.restorePocketBatch([
    {
      appId: "NotionAI",
      chatUrl: "https://app.notion.com/logout",
      sourceId: "unsafe-builtin",
      batchId: "notion-route-safety",
      groupId: "saved-group",
      groupIndex: 0,
      tabIndex: 0
    },
    {
      appId: "NotionAI",
      chatUrl: "https://app.notion.com/chat?extra=1&t=thread-1#turn",
      sourceId: "safe-builtin",
      batchId: "notion-route-safety",
      groupId: "saved-group",
      groupIndex: 0,
      tabIndex: 1
    },
    {
      appId: "CustomNotion",
      chatUrl: "https://app.notion.com/logout?custom=1",
      sourceId: "custom-route",
      batchId: "notion-route-safety",
      groupId: "saved-group",
      groupIndex: 0,
      tabIndex: 2
    },
    {
      chatUrl: "https://app.notion.com/logout?legacy=1",
      sourceId: "legacy-ambiguous-route",
      batchId: "notion-route-safety",
      groupId: "saved-group",
      groupIndex: 0,
      tabIndex: 3
    }
  ]), true);

  assert.deepEqual(state.groups[0].chatApps.map(({ appId, initialHref }) => ({ appId, initialHref })), [
    { appId: "NotionAI", initialHref: "https://app.notion.com/ai" },
    { appId: "NotionAI", initialHref: "https://app.notion.com/chat?t=thread-1" },
    { appId: "CustomNotion", initialHref: "https://app.notion.com/logout?custom=1" },
    { appId: "NotionAI", initialHref: "https://app.notion.com/ai" }
  ]);
  assert.equal(remembered, 1);
  assert.equal(rendered, 1);

  const liveChat = state.groups[0].chatApps[0];
  const liveFrame = {
    dataset: {
      appId: liveChat.appId,
      instanceId: liveChat.instanceId,
      currentHref: "https://app.notion.com/logout"
    }
  };
  global.document = {
    querySelector: (selector) => selector.includes(liveChat.instanceId) ? liveFrame : null,
    querySelectorAll: () => [liveFrame]
  };
  assert.equal(controller.loadPocketEntryInFrame({
    appId: "NotionAI",
    instanceId: liveChat.instanceId,
    chatUrl: "https://app.notion.com/logout"
  }), true);
  assert.equal(liveFrame.dataset.currentHref, "https://app.notion.com/ai");
  assert.equal(assignedHref, "https://app.notion.com/ai");
  delete global.document;

  console.log("Notion workspace and Pocket route safety: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
