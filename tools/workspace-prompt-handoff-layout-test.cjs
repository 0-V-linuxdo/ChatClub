#!/usr/bin/env node

const assert = require("node:assert/strict");

(async () => {
  const { createPromptHandoffWorkspaceSnapshot } = await import("../app/workspace/prompt-handoff-layout.js");
  const { createWorkspaceLayoutController } = await import("../app/workspace/layout-controller.js");
  const { restoreWorkspaceSnapshotV1 } = await import("../app/workspace/session-state.js");

  const apps = [
    { id: "ChatGPT", url: "https://chatgpt.com/" },
    { id: "Gemini", url: "https://gemini.google.com/app" },
    { id: "Broken", url: "javascript:alert(1)" }
  ];
  const launch = createPromptHandoffWorkspaceSnapshot({
    appIdGroups: [
      ["ChatGPT"],
      ["Missing"],
      ["ChatGPT"],
      { appId: "Gemini", currentHref: "https://gemini.google.com/app/source-conversation" },
      [],
      ["Broken"]
    ],
    apps,
    generation: "launch-generation",
    basePresetId: "research",
    layoutName: "New tab prompt"
  });

  assert.deepEqual(launch.acceptedAppIds, ["ChatGPT", "ChatGPT", "Gemini"]);
  assert.deepEqual(launch.skipped, [
    { groupIndex: 1, appId: "Missing", reason: "app-not-found" },
    { groupIndex: 4, appId: "", reason: "invalid-app-id" },
    { groupIndex: 5, appId: "Broken", reason: "invalid-home-url" }
  ]);
  assert.deepEqual(launch.snapshot, {
    schemaVersion: 1,
    generation: "launch-generation",
    layout: {
      type: "temporary",
      presetId: "research",
      name: "New tab prompt",
      pocketBatchId: ""
    },
    groups: [
      { tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/" }], activeIndex: 0 },
      { tabs: [{ appId: "ChatGPT", currentHref: "https://chatgpt.com/" }], activeIndex: 0 },
      { tabs: [{ appId: "Gemini", currentHref: "https://gemini.google.com/app" }], activeIndex: 0 }
    ],
    fullscreenGroupIndex: null
  });
  assert.doesNotMatch(
    JSON.stringify(launch.snapshot),
    /\/c\/|source-conversation|runtime-group|runtime-frame/,
    "the launch snapshot must carry only catalog home URLs and no source runtime identity"
  );

  let groupNumber = 0;
  let frameNumber = 0;
  let layoutNumber = 0;
  const restored = restoreWorkspaceSnapshotV1(launch.snapshot, {
    validAppIds: apps.map((app) => app.id),
    validPresetIds: ["default", "research"],
    fallbackPresetId: "default",
    createGroupId: () => `target-group-${++groupNumber}`,
    createFrameId: () => `target-frame-${++frameNumber}`,
    createLayoutId: () => `target-layout-${++layoutNumber}`
  });

  assert.deepEqual(restored.groups, [
    {
      id: "target-group-1",
      temporary: true,
      pocketBatchId: "",
      chatApps: [{ appId: "ChatGPT", instanceId: "target-frame-1", initialHref: "https://chatgpt.com/" }]
    },
    {
      id: "target-group-2",
      temporary: true,
      pocketBatchId: "",
      chatApps: [{ appId: "ChatGPT", instanceId: "target-frame-2", initialHref: "https://chatgpt.com/" }]
    },
    {
      id: "target-group-3",
      temporary: true,
      pocketBatchId: "",
      chatApps: [{ appId: "Gemini", instanceId: "target-frame-3", initialHref: "https://gemini.google.com/app" }]
    }
  ]);
  assert.deepEqual(restored.activeTabs, {
    "target-group-1": "target-frame-1",
    "target-group-2": "target-frame-2",
    "target-group-3": "target-frame-3"
  });
  assert.deepEqual(restored.temporaryLayoutPreset, {
    id: "target-layout-1",
    name: "New tab prompt",
    temporary: true,
    pocketBatchId: "",
    chatAppIdGroups: [["ChatGPT"], ["ChatGPT"], ["Gemini"]]
  });
  assert.equal(restored.fullscreenGroupId, null);

  const allInvalid = createPromptHandoffWorkspaceSnapshot({
    appIdGroups: [["Missing"], [], ["Broken"]],
    apps
  });
  assert.equal(allInvalid.snapshot, null, "an all-invalid handoff must not hydrate a fallback workspace");
  assert.deepEqual(allInvalid.acceptedAppIds, []);
  assert.equal(allInvalid.skipped.length, 3);

  const noTargets = createPromptHandoffWorkspaceSnapshot({ appIdGroups: [], apps });
  assert.deepEqual(noTargets, { snapshot: null, acceptedAppIds: [], skipped: [] });

  const options = { activeLayoutPresetId: "research", layoutPresets: [{ id: "research", chatAppIdGroups: [["ChatGPT"]] }] };
  const state = {
    options,
    customConfig: [],
    temporaryLayoutPreset: null,
    groups: [{ id: "saved-group", chatApps: [{ appId: "ChatGPT", instanceId: "saved-frame" }] }],
    activeTabs: { "saved-group": "saved-frame" },
    frameLoadingInstanceIds: [],
    fullscreenGroupId: "saved-group"
  };
  let remembered = 0;
  const emptyController = createWorkspaceLayoutController({
    state,
    services: {
      allApps: () => apps,
      appById: (id) => apps.find((app) => app.id === id),
      createFrameId: () => "unused-frame",
      createGroupId: () => "unused-group",
      createLayoutId: () => "empty-prompt-layout",
      formatShortcut: () => "",
      inferAppName: (app) => app?.id || "",
      normalizeOptions: (value) => value,
      notify() {},
      render() {},
      saveOptions: async (value) => value
    },
    session: {
      rememberWorkspaceSession() { remembered += 1; },
      restoreWorkspaceSession() { return false; }
    },
    view: {
      appendChatGroup() {},
      closePopovers() {},
      reconcileAppCatalogDom() {},
      refreshChatTabPresentations() {},
      syncWorkspaceDom() {}
    }
  });
  emptyController.hydrateEmptyPromptHandoffWorkspace();
  assert.deepEqual(state.groups, []);
  assert.deepEqual(state.activeTabs, {});
  assert.equal(state.fullscreenGroupId, null);
  assert.deepEqual(state.temporaryLayoutPreset.chatAppIdGroups, []);
  assert.equal(state.options, options, "the fail-closed target workspace must not mutate saved layout options");
  assert.equal(remembered, 0, "an empty prompt handoff workspace must not overwrite the saved workspace session");
  await emptyController.reconcileAppCatalog([], options);
  assert.deepEqual(state.groups, [], "catalog reconciliation must not add a fallback app to an empty handoff workspace");
  assert.equal(state.options, options, "catalog reconciliation must keep saved layout options untouched");

  console.log("workspace prompt handoff launch layout: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
