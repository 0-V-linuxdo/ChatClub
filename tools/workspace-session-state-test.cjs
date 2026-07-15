#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const session = await import("../shared/workspace-session.js");
  const {
    captureWorkspaceSnapshotV1,
    normalizeWorkspaceSnapshotV1,
    restoreWorkspaceSnapshotV1
  } = await import("../app/workspace/session-state.js");

  assert.equal(session.WORKSPACE_SESSION_SCHEMA_VERSION, 1);
  assert.equal(session.normalizeWorkspaceSessionGeneration("  generation-a  "), "generation-a");
  assert.equal(
    session.normalizeWorkspaceSessionGeneration(""),
    session.DEFAULT_WORKSPACE_SESSION_GENERATION
  );
  assert.equal(
    session.normalizeWorkspaceSessionGeneration({ generation: "not-a-string" }),
    session.DEFAULT_WORKSPACE_SESSION_GENERATION
  );
  assert.equal(session.workspaceSessionMirrorKey(42), `${session.WORKSPACE_SESSION_MIRROR_PREFIX}42`);
  assert.equal(session.workspaceSessionMirrorTabId(session.workspaceSessionMirrorKey(42)), 42);
  assert.equal(session.workspaceSessionMirrorTabId(`${session.WORKSPACE_SESSION_MIRROR_PREFIX}0`), null);
  assert.equal(session.workspaceSessionMirrorTabId(`${session.WORKSPACE_SESSION_MIRROR_PREFIX}01`), null);
  assert.equal(session.workspaceSessionMirrorTabId("unrelated"), null);
  assert.throws(() => session.workspaceSessionMirrorKey(0), /positive browser tab id/);

  const workspaceId = "page-1234567890ab";
  assert.equal(session.normalizeWorkspaceSessionId(workspaceId), workspaceId);
  assert.equal(session.normalizeWorkspaceSessionId("page-short"), "");
  assert.equal(session.workspaceSessionWorkspaceId(session.workspaceSessionWorkspaceKey(workspaceId)), workspaceId);
  assert.equal(session.workspaceSessionWorkspaceId("unrelated"), "");
  assert.equal(session.workspaceSessionBindingTabId(session.workspaceSessionBindingKey(73)), 73);
  assert.equal(session.workspaceSessionBindingTabId(`${session.WORKSPACE_SESSION_BINDING_PREFIX}073`), null);
  assert.throws(() => session.workspaceSessionWorkspaceKey("bad"), /valid workspace id/);

  const extensionUrl = "chrome-extension://example/chatClub.html?keep=1#panel=settings";
  const identifiedUrl = session.workspaceSessionUrl(extensionUrl, workspaceId);
  assert.equal(session.workspaceSessionIdFromUrl(identifiedUrl), workspaceId);
  assert.equal(new URL(identifiedUrl).searchParams.get("keep"), "1");
  assert.equal(new URLSearchParams(new URL(identifiedUrl).hash.slice(1)).get("panel"), "settings");
  assert.equal(session.workspaceSessionIdFromUrl("chrome-extension://example/chatClub.html#workspace=bad"), "");
  assert.match(session.createWorkspaceSessionId(), /^page-[A-Za-z0-9_-]{12,128}$/);
  assert.notEqual(session.createWorkspaceSessionGeneration(), session.createWorkspaceSessionGeneration());

  const captured = captureWorkspaceSnapshotV1({
    generation: "generation-a",
    options: { activeLayoutPresetId: "research" },
    groups: [
      {
        id: "runtime-group-one",
        chatApps: [
          { appId: "ChatGPT", instanceId: "runtime-frame-one" },
          { appId: "ChatGPT", instanceId: "runtime-frame-two" }
        ]
      },
      {
        id: "runtime-group-two",
        chatApps: [{ appId: "Gemini", instanceId: "runtime-frame-three", currentHref: "javascript:alert(1)" }]
      }
    ],
    activeTabs: {
      "runtime-group-one": "runtime-frame-two",
      "runtime-group-two": "runtime-frame-three"
    },
    fullscreenGroupId: "runtime-group-two",
    currentHrefByInstanceId: new Map([
      ["runtime-frame-one", "https://chatgpt.com/c/one"],
      ["runtime-frame-two", "https://chatgpt.com/c/two"]
    ])
  });
  assert.deepEqual(captured, {
    schemaVersion: 1,
    generation: "generation-a",
    layout: { type: "preset", presetId: "research" },
    groups: [
      {
        tabs: [
          { appId: "ChatGPT", currentHref: "https://chatgpt.com/c/one" },
          { appId: "ChatGPT", currentHref: "https://chatgpt.com/c/two" }
        ],
        activeIndex: 1
      },
      {
        tabs: [{ appId: "Gemini", currentHref: "" }],
        activeIndex: 0
      }
    ],
    fullscreenGroupIndex: 1
  });
  const serializedCapture = JSON.stringify(captured);
  for (const runtimeId of [
    "runtime-group-one",
    "runtime-group-two",
    "runtime-frame-one",
    "runtime-frame-two",
    "runtime-frame-three"
  ]) assert.ok(!serializedCapture.includes(runtimeId), `snapshot leaked runtime id ${runtimeId}`);
  assert.equal(captured.groups[0].tabs.length, 2, "duplicate apps must remain addressable by index");

  const raw = {
    schemaVersion: 1,
    generation: "generation-b",
    layout: { type: "preset", presetId: "deleted-preset" },
    groups: [
      {
        tabs: [
          { appId: "A", currentHref: "https://a.example/thread" },
          { appId: "Deleted", currentHref: "https://deleted.example/thread" },
          { appId: "A", currentHref: "https://a.example/second" }
        ],
        activeIndex: 1
      },
      {
        tabs: [{ appId: "Deleted", currentHref: "https://deleted.example/only" }],
        activeIndex: 0
      },
      {
        tabs: [
          { appId: "B", currentHref: "ftp://b.example/thread" },
          { appId: "A", currentHref: "https://a.example/last" }
        ],
        activeIndex: 99
      }
    ],
    fullscreenGroupIndex: 2
  };
  const normalized = normalizeWorkspaceSnapshotV1(raw, {
    validAppIds: ["A", "B"],
    validPresetIds: ["default", "second"],
    fallbackPresetId: "default"
  });
  assert.deepEqual(normalized.layout, { type: "preset", presetId: "default" });
  assert.equal(normalized.groups.length, 2, "an empty group should be removed without losing siblings");
  assert.deepEqual(normalized.groups[0], {
    tabs: [
      { appId: "A", currentHref: "https://a.example/thread" },
      { appId: "A", currentHref: "https://a.example/second" }
    ],
    activeIndex: 1
  });
  assert.deepEqual(normalized.groups[1], {
    tabs: [
      { appId: "B", currentHref: "" },
      { appId: "A", currentHref: "https://a.example/last" }
    ],
    activeIndex: 1
  });
  assert.equal(normalized.fullscreenGroupIndex, 1, "fullscreen group index should follow retained groups");
  normalized.groups[0].tabs[0].appId = "Changed";
  assert.equal(raw.groups[0].tabs[0].appId, "A", "normalization must not mutate its input");
  assert.equal(normalizeWorkspaceSnapshotV1({ ...raw, schemaVersion: 2 }), null);

  assert.equal(restoreWorkspaceSnapshotV1(raw, {
    validAppIds: ["A", "B"],
    validPresetIds: ["default"],
    fallbackPresetId: "default",
    createGroupId: () => "must-not-run",
    createFrameId: () => "must-not-run"
  }), null, "a deleted persistent preset must fall back through normal workspace hydration");

  const restored = restoreWorkspaceSnapshotV1({
    ...raw,
    layout: { type: "preset", presetId: "default" }
  }, {
    validAppIds: ["A", "B"],
    validPresetIds: ["default"],
    fallbackPresetId: "default",
    createGroupId: (index) => `group-${index}`,
    createFrameId: (groupIndex, tabIndex) => `frame-${groupIndex}-${tabIndex}`,
    createLayoutId: () => "unused-layout"
  });
  assert.equal(restored.activeLayoutPresetId, "default");
  assert.equal(restored.temporaryLayoutPreset, null);
  assert.deepEqual(restored.groups, [
    {
      id: "group-0",
      chatApps: [
        { appId: "A", instanceId: "frame-0-0", initialHref: "https://a.example/thread" },
        { appId: "A", instanceId: "frame-0-1", initialHref: "https://a.example/second" }
      ]
    },
    {
      id: "group-1",
      chatApps: [
        { appId: "B", instanceId: "frame-1-0" },
        { appId: "A", instanceId: "frame-1-1", initialHref: "https://a.example/last" }
      ]
    }
  ]);
  assert.deepEqual(restored.activeTabs, {
    "group-0": "frame-0-1",
    "group-1": "frame-1-1"
  });
  assert.equal(restored.fullscreenGroupId, "group-1");

  const temporaryCapture = captureWorkspaceSnapshotV1({
    generation: "generation-temporary",
    activeLayoutPresetId: "removed-base-preset",
    temporaryLayoutPreset: {
      id: "runtime-temporary-layout",
      name: "Pocket restore",
      temporary: true,
      pocketBatchId: "batch-7"
    },
    groups: [{
      id: "runtime-pocket-group",
      chatApps: [{ appId: "A", instanceId: "runtime-pocket-frame", currentHref: "https://a.example/pocket" }]
    }],
    activeTabs: { "runtime-pocket-group": "runtime-pocket-frame" }
  });
  assert.deepEqual(temporaryCapture.layout, {
    type: "temporary",
    presetId: "removed-base-preset",
    name: "Pocket restore",
    pocketBatchId: "batch-7"
  });
  assert.ok(!JSON.stringify(temporaryCapture).includes("runtime-temporary-layout"));
  const temporaryRestore = restoreWorkspaceSnapshotV1(temporaryCapture, {
    validAppIds: ["A"],
    validPresetIds: ["default"],
    fallbackPresetId: "default",
    createGroupId: () => "restored-pocket-group",
    createFrameId: () => "restored-pocket-frame",
    createLayoutId: () => "restored-temporary-layout"
  });
  assert.equal(temporaryRestore.activeLayoutPresetId, "default", "temporary state may fall back from a removed base preset");
  assert.deepEqual(temporaryRestore.temporaryLayoutPreset, {
    id: "restored-temporary-layout",
    name: "Pocket restore",
    temporary: true,
    pocketBatchId: "batch-7",
    chatAppIdGroups: [["A"]]
  });
  assert.deepEqual(temporaryRestore.groups[0], {
    id: "restored-pocket-group",
    temporary: true,
    pocketBatchId: "batch-7",
    chatApps: [{
      appId: "A",
      instanceId: "restored-pocket-frame",
      initialHref: "https://a.example/pocket"
    }]
  });

  const emptyAfterDeletion = {
    schemaVersion: 1,
    generation: "generation-c",
    layout: { type: "preset", presetId: "default" },
    groups: [{ tabs: [{ appId: "Deleted", currentHref: "https://deleted.example" }], activeIndex: 0 }],
    fullscreenGroupIndex: 0
  };
  const fallbackRestore = restoreWorkspaceSnapshotV1(emptyAfterDeletion, {
    validAppIds: ["A"],
    validPresetIds: ["default"],
    fallbackPresetId: "default",
    fallbackGroups: [["A"]],
    createGroupId: () => "fallback-group",
    createFrameId: () => "fallback-frame"
  });
  assert.equal(fallbackRestore.groups[0].chatApps[0].appId, "A");
  assert.equal(fallbackRestore.fullscreenGroupId, null);
  assert.equal(restoreWorkspaceSnapshotV1(emptyAfterDeletion, {
    validAppIds: ["A"],
    validPresetIds: ["default"],
    fallbackPresetId: "default",
    createGroupId: () => "unused-group",
    createFrameId: () => "unused-frame"
  }), null);

  console.log("workspace session snapshot state: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
