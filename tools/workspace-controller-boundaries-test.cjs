#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const lineCount = (source) => source.split(/\r?\n/).length;

(async () => {
  const workspace = read("app/workspace/controller.js");
  const drag = read("app/workspace/drag-controller.js");
  const navigator = read("app/workspace/message-navigator-controller.js");
  const frame = read("app/workspace/frame-controller.js");
  const layout = read("app/workspace/layout-controller.js");
  const pocket = read("app/workspace/pocket-controller.js");
  const session = read("app/workspace/session-controller.js");
  const statePorts = read("app/workspace/state-ports.js");
  const view = read("app/workspace/view-controller.js");

  assert.ok(lineCount(workspace) < 1200, "Workspace facade must remain assembly-only and need no size exception");
  assert.ok(lineCount(drag) > 300, "drag coordinator must remain a substantive lifecycle boundary");
  assert.ok(lineCount(navigator) > 180, "Message Navigator controller must remain a substantive lifecycle boundary");
  assert.ok(lineCount(frame) > 700 && lineCount(frame) < 1200, "frame lifecycle/navigation must remain a substantive bounded owner");
  assert.ok(lineCount(layout) > 250, "layout/catalog reconciliation must remain a substantive owner");
  assert.ok(lineCount(view) > 700 && lineCount(view) < 1200, "Workspace rendering and menus must remain a bounded owner");
  assert.ok(lineCount(pocket) > 150, "Pocket restore must remain a substantive owner");
  assert.ok(lineCount(session) > 60, "session persistence must remain an explicit owner");
  assert.match(workspace, /createWorkspaceDragController\(\{/);
  assert.match(workspace, /createWorkspaceMessageNavigatorController\(\{/);
  assert.match(workspace, /createWorkspaceFrameController\(\{/);
  assert.match(workspace, /createWorkspaceLayoutController\(\{/);
  assert.match(workspace, /createWorkspacePocketController\(\{/);
  assert.match(workspace, /createWorkspaceViewController\(\{/);
  assert.match(workspace, /createWorkspaceOwnerStatePorts\(state\)/);
  assert.match(workspace, /createBindOnceControllerPort\("Workspace frame"/);
  assert.doesNotMatch(workspace, /function handleTabPointerMove\(/);
  assert.doesNotMatch(workspace, /function closeMessageNavigatorMenuOnParentKeydown\(/);
  assert.doesNotMatch(workspace, /let messageNavigatorMenuIframe/);
  assert.doesNotMatch(workspace, /function renderChatFrame\(/);
  assert.doesNotMatch(workspace, /function rememberFrameLocation\(/);
  assert.doesNotMatch(workspace, /function restorePocketBatch\(/);

  assert.match(drag, /validateControllerContract\(dependencies, "Workspace drag controller"/);
  assert.match(drag, /moveTabWithinGroup\(group, tabId, insertIndex\)/);
  assert.match(drag, /moveGroupWithinWorkspace\(state\.groups, group\.id, insertIndex\)/);
  assert.match(drag, /iframe\.dataset\.dragPointerEvents/);
  assert.match(drag, /document\.removeEventListener\("pointercancel", cancelTabPointerDrag, true\)/);
  assert.match(drag, /consumeSuppressedTabClick/);
  assert.doesNotMatch(drag, /deleteThread|executeTopicDelete|frameBindingId/);

  assert.match(navigator, /validateControllerContract\(dependencies, "Workspace Message Navigator controller"/);
  assert.match(navigator, /sendToContentFrame\(iframe, "setMessageNavigator"/);
  assert.match(navigator, /sendToContentFrame\(iframe, "getMessageNavigatorState"/);
  assert.match(navigator, /sendToContentFrame\(iframe, "hideMessageNavigatorMenu"/);
  assert.match(navigator, /document\.querySelector\("\.modal-backdrop, \.popover-menu"\)/);
  assert.doesNotMatch(navigator, /deleteThread|executeTopicDelete|trustedInput/);

  assert.match(frame, /function frameDeleteThreadPayload\(/, "Delete identity payload must remain in the frame owner");
  assert.match(frame, /function consumeFrameInitialHref\(instanceId\)/, "one-shot restored href mutation must remain in the frame state owner");
  assert.match(frame, /executeTopicDelete\(iframe, payload, deleteSiteConfig, timeoutMs\)/);
  assert.match(layout, /function addAppToGroup\(groupId, appId\)/, "workspace membership mutation must remain in the layout state owner");
  assert.match(view, /const dataset = \{ instanceId: chat\.instanceId, appId: app\.id, frameBindingId \}/, "iframe binding identity must remain unchanged");
  assert.doesNotMatch(view, /delete chat\.initialHref/, "the read-only render owner must not mutate restored frame state");
  assert.doesNotMatch(view, /group\.chatApps\.push\(/, "the read-only render owner must not mutate workspace membership");
  assert.match(statePorts, /drag:[\s\S]*read: \["activeTabs", "groups"\]/);
  assert.match(statePorts, /messageNavigator:[\s\S]*read: \["groups", "options"\]/);
  assert.doesNotMatch(drag, /state\.options|state\.fullscreenGroupId/);
  assert.doesNotMatch(navigator, /state\.activeTabs|state\.frameLoadingInstanceIds/);

  const { createWorkspaceDragController } = await import(
    pathToFileURL(path.join(root, "app/workspace/drag-controller.js")).href
  );
  global.document = { addEventListener() {} };
  const { createWorkspaceMessageNavigatorController } = await import(
    pathToFileURL(path.join(root, "app/workspace/message-navigator-controller.js")).href
  );
  delete global.document;
  const noop = () => {};
  const dragState = {
    groups: [{ id: "group-1", chatApps: [{ instanceId: "tab-1" }, { instanceId: "tab-2" }] }],
    activeTabs: { "group-1": "tab-1" }
  };
  const dragEffects = [];
  const dragApi = createWorkspaceDragController({
    state: dragState,
    persistLayout: async () => { dragEffects.push("persist"); },
    syncGroupTabOrder: () => { dragEffects.push("sync-tabs"); },
    activateChatTab: (_group, instanceId) => { dragEffects.push(`activate:${instanceId}`); },
    syncWorkspaceDom: () => { dragEffects.push("sync-workspace"); }
  });
  assert.equal(typeof dragApi.startTabPointerDrag, "function");
  assert.equal(typeof dragApi.consumeSuppressedTabClick, "function");
  assert.throws(
    () => createWorkspaceDragController({ state: { groups: [] }, extra: true }),
    /extra dependencies field extra/
  );

  const classList = { add() {}, remove() {}, contains() { return false; } };
  global.document = {
    body: { classList },
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {}
  };
  const transferValues = new Map();
  const dataTransfer = {
    getData: (key) => transferValues.get(key) || "",
    setData: (key, value) => transferValues.set(key, value)
  };
  dragApi.startTabDrag(
    { currentTarget: { classList }, dataTransfer },
    dragState.groups[0],
    dragState.groups[0].chatApps[1]
  );
  await dragApi.moveTabByDrop(
    { clientX: 0, currentTarget: {}, dataTransfer },
    dragState.groups[0]
  );
  delete global.document;
  assert.deepEqual(dragState.groups[0].chatApps.map((chat) => chat.instanceId), ["tab-2", "tab-1"]);
  assert.equal(dragState.activeTabs["group-1"], "tab-2");
  assert.deepEqual(dragEffects, ["persist", "sync-tabs", "activate:tab-2"]);

  const navigatorState = { groups: [], options: {} };
  const navigatorCommands = [];
  const navigatorApi = createWorkspaceMessageNavigatorController({
    state: navigatorState,
    appById: (id) => id === "ChatGPT" ? { id, name: "ChatGPT", url: "https://chatgpt.com/" } : null,
    openableTabUrl: (value) => /^https?:\/\//.test(String(value || "")) ? String(value) : "",
    knownNoConversationPage: () => false,
    sendToContentFrame: async (_iframe, command, data) => {
      navigatorCommands.push({ command, data });
      return {};
    },
    activeChatForGroup: () => null,
    activeIframe: () => null,
    activeHref: async () => "",
    activeShortcutGroupId: () => "",
    notify: noop,
    syncWorkspaceDom: noop,
    closePopovers: noop
  });
  assert.equal(typeof navigatorApi.dismissTrackedMessageNavigatorMenu, "function");
  assert.equal(typeof navigatorApi.reapplyMessageNavigatorForFrame, "function");
  const iframe = {
    dataset: {
      appId: "ChatGPT",
      currentHref: "https://chatgpt.com/c/example",
      messageNavigatorEnabled: "1",
      messageNavigatorSiteId: ""
    },
    getAttribute: () => "",
    src: ""
  };
  assert.equal(navigatorApi.messageNavigatorPayloadForFrame(iframe)?.config?.id, "chatgpt");
  await navigatorApi.reapplyMessageNavigatorForFrame(iframe);
  assert.equal(navigatorCommands.at(-1)?.command, "setMessageNavigator");
  assert.equal(iframe.dataset.messageNavigatorSiteId, "chatgpt");

  console.log(`workspace controller boundaries: ok (${lineCount(workspace)} facade lines)`);
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
