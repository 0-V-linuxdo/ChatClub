#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const runtime = read("app/runtime.js");
const sessionStore = read("app/workspace/session-store.js");
const bootstrapRecovery = read("app/workspace/bootstrap-recovery-controller.js");
const workspace = read("app/workspace/controller.js");
const session = read("app/workspace/session-controller.js");
const layout = read("app/workspace/layout-controller.js");
const frame = read("app/workspace/frame-controller.js");
const pocket = read("app/workspace/pocket-controller.js");

const initStart = runtime.indexOf("async function init()");
const initEnd = runtime.indexOf("\n}\n\ninit().catch", initStart);
const init = runtime.slice(initStart, initEnd);
const loadIndex = init.indexOf("workspaceSessionStore.load()");
const runtimeRefreshIndex = init.indexOf('action: "reloadConfigs"');
const hydrateIndex = init.indexOf("workspaceController.hydrateGroups(promptHandoffLaunch.snapshot || workspaceSessionSnapshot)");
const persistIndex = init.indexOf("workspaceController.persistWorkspaceSession()");
const renderIndex = init.lastIndexOf("\n  render();");
const restoreBarrierIndex = init.indexOf("waitForInitialWorkspaceFrameRestoration()");
const preferredModelIndex = init.indexOf("applyPreferredModelsToFrames(null, { immediate: false })");

assert.ok(initStart >= 0 && initEnd > initStart, "app init must remain discoverable");
assert.ok(loadIndex >= 0, "workspace snapshot must start loading during bootstrap");
assert.ok(hydrateIndex > loadIndex, "workspace snapshot must load before hydration");
assert.ok(persistIndex > hydrateIndex, "hydration must be durably persisted before the workspace becomes ready");
assert.ok(renderIndex > persistIndex, "the first app render must wait for durable workspace persistence");
assert.ok(restoreBarrierIndex > renderIndex, "the initial workspace must render before the restoration barrier starts");
assert.ok(preferredModelIndex > restoreBarrierIndex, "preferred models must wait for initial frame restoration");
assert.ok(runtimeRefreshIndex > loadIndex, "content-script reconciliation must start after snapshot loading begins");
assert.match(bootstrapRecovery, /function initialWorkspaceFrameRestoreState\(\)/);
assert.match(bootstrapRecovery, /function waitForInitialWorkspaceFrameRestoration\(/);
assert.match(runtime, /createWorkspaceBootstrapRecoveryController\(\{/);
assert.match(runtime, /createWorkspaceSessionStore\(\{[\s\S]*?currentTab: currentExtensionTab[\s\S]*?currentTabId: currentExtensionTabId[\s\S]*?persistWorkspaceSession:[\s\S]*?storageGet[\s\S]*?storageRemove[\s\S]*?\}\)/);
assert.doesNotMatch(runtime.slice(runtime.indexOf("createWorkspaceSessionStore({"), runtime.indexOf("const workspaceController")), /\bstorageSet\b/, "stable workspace records must have one background writer");
assert.match(runtime, /action: "claimWorkspaceSessionRecovery"/, "a naked replacement page must claim before default hydration");
assert.doesNotMatch(runtime, /clearedTabsController/, "the restore banner must not remain in the page runtime");
assert.doesNotMatch(runtime, /attachWorkspaceClearedTabsController/, "Tabs memory must replace the cleared-tab banner controller");
assert.match(read("app/settings/controller.js"), /dialog\.remove\(\);\s*onSettingsDialogClosed\(\);/,
  "the Settings close path must still notify its optional close hook");
assert.match(
  runtime.slice(runtime.indexOf("init().catch")),
  /renderRuntimeBootstrapFailure\(error\)/,
  "any uncaught bootstrap failure must retain the runtime recovery surface"
);
assert.match(runtime, /workspaceTabsSidebarController\.syncSidebar\(shell\)/, "the remembered ChatClub-tab sidebar must render with the workspace");
assert.match(runtime, /attachWorkspaceTabsSidebarController\(/, "runtime must own the remembered ChatClub-tab sidebar");
assert.match(
  runtime,
  /initializeTopbarPromptPlaceholder\(\{\s*persist:\s*!workspaceSessionSnapshot\s*\}\)/,
  "a restored workspace page must not persist a competing topbar placeholder write during init"
);
assert.doesNotMatch(runtime, /absorbIntoCurrent/, "restore must open a new browser tab for every cleared ChatClub page");
assert.match(runtime, /action: "commitWorkspaceSessionRecovery"[\s\S]*?workspaceId,[\s\S]*?claimId/, "a restored claim must commit by workspace and claim ids");
assert.match(
  bootstrapRecovery,
  /function scheduleWorkspaceSessionLoadRecovery\([\s\S]*?await sessionStore\.load\(\)[\s\S]*?reloadPage\(\)/,
  "a failed workspace load must retry automatically and reload after ownership recovers"
);
const loadFailureStart = runtime.indexOf("const workspaceSessionSnapshotPromise = workspaceSessionStore.load().catch");
const loadFailureRecovery = runtime.indexOf("scheduleWorkspaceSessionLoadRecovery(); return;", loadFailureStart);
assert.ok(loadFailureStart >= 0 && loadFailureRecovery > loadFailureStart,
  "workspace bootstrap failure must arm automatic session recovery");
assert.match(runtime, /action: "persistWorkspaceSession"/, "workspace snapshots must be serialized through the background coordinator");
assert.match(runtime, /workspaceSessionStore,\s*\n\s*framePort:/, "the workspace controller must receive the per-page store");
assert.match(runtime, /createWorkspaceSessionStore\(\{\s*\n\s*disabled: isOptionsPage,/, "the options surface must not participate in workspace recovery persistence");

const saveStart = sessionStore.indexOf("  function save(snapshot) {");
const saveEnd = sessionStore.indexOf("\n  function clear() {", saveStart);
assert.ok(saveStart >= 0 && saveEnd > saveStart, "workspace page save implementation must remain discoverable");
const saveImplementation = sessionStore.slice(saveStart, saveEnd);
assert.match(
  saveImplementation,
  /persistDirtySnapshot\(target\)/,
  "page save must delegate its latest logical state to the retrying durable writer"
);
const dirtyPersistStart = sessionStore.indexOf("  async function persistDirtySnapshot(target) {");
const dirtyPersistEnd = sessionStore.indexOf("\n  async function persistLoadedPageSnapshot", dirtyPersistStart);
assert.ok(dirtyPersistStart >= 0 && dirtyPersistEnd > dirtyPersistStart,
  "the retrying workspace writer must remain discoverable");
assert.match(
  sessionStore.slice(dirtyPersistStart, dirtyPersistEnd),
  /persistWorkspace\(target\.workspaceId, normalizedSnapshot,/,
  "the retrying workspace writer must serialize snapshots through the background coordinator"
);
assert.doesNotMatch(
  saveImplementation,
  /\bstorageSet\b/,
  "page save must not become a second writer for stable snapshots or tab bindings"
);

assert.match(
  layout,
  /const persistDefaults = !snapshot;[\s\S]*if \(persistDefaults\) rememberWorkspaceSession\(\);/,
  "a durable workspace snapshot must not be overwritten by default hydration"
);
assert.match(session, /generation: workspaceSessionStore\.generation\(\)/);
assert.match(session, /currentHrefForTab: \(chat\) => currentHrefForWorkspaceTab\(chat, framesByInstanceId\)/);
assert.match(session, /normalizeCurrentHref: \(appId, href\) => restorableChatFrameHref\(appById\(appId\), href\)/);
assert.doesNotMatch(session, /validPresetIds/, "workspace-tab restore must apply conversation URLs even if a layout preset was removed");
assert.match(session, /workspaceSessionStore\.save\(snapshot\)/);
assert.match(session, /async function preserveCurrentWorkspaceForNewChat\(/);
assert.match(session, /snapshotWithRetainedConversation/);
assert.match(session, /preferredWorkspaceTabHref/);
assert.match(sessionStore, /function durableSnapshot\(/);
assert.match(session, /workspaceSessionStore\.adopt\(createWorkspaceSessionId\(\)\)/);
assert.match(session, /state\.topicTitleCustom = false/);
assert.match(
  session,
  /function rememberWorkspaceSession\(\) \{[\s\S]*workspaceSnapshotIsRememberable\(snapshot\)[\s\S]*workspaceSessionStore\.flush\(\)/,
  "a titled or conversation snapshot must flush if the fire-and-forget save did not finish"
);
assert.match(
  session,
  /await persistWorkspaceSession\(\);[\s\S]*await workspaceSessionStore\.flush\(\)[\s\S]*preserved: true/,
  "the rebound New Chat workspace must flush after dropping topicTitle"
);
assert.match(
  runtime,
  /function persistWorkspaceSessionForUnload\([\s\S]*rememberWorkspaceSession\(\)[\s\S]*workspaceSessionStore\.flush\(\)/,
  "hiding or unloading the ChatClub page must flush the latest workspace snapshot"
);
assert.match(runtime, /addEventListener\("pagehide", persistWorkspaceSessionForUnload\)/);
assert.match(
  runtime,
  /visibilityState === "hidden"\) persistWorkspaceSessionForUnload\(\)/,
  "switching away from ChatClub must flush Tabs memory before an extension reload"
);
assert.match(
  workspace,
  /preserveCurrentWorkspaceForNewChat: async \(hrefs\) => \{[\s\S]*?result\?\.preserved\) render\(\)/,
  "a rebound New Chat workspace must refresh the page title after dropping topicTitle"
);
assert.match(
  frame,
  /await preserveCurrentWorkspaceForNewChat\(\[\s*iframe\.dataset\.currentHref/,
  "starting a new chat in the active tab must freeze the current workspace before navigation"
);
assert.match(
  runtime,
  /await workspaceController\.preserveCurrentWorkspaceForNewChat\(\s*frames\.map\(/,
  "new chat on every frame must freeze the current workspace once"
);
assert.match(
  frame,
  /state\.activeTabs\[group\.id\] = instanceId;\s*rememberWorkspaceSession\(\);/,
  "selecting an internal tab must synchronously update the page snapshot"
);
assert.match(
  frame,
  /if \(hrefChanged\) \{\s*rememberWorkspaceSession\(\);\s*if \(ensureFrameAttributeContract\(iframe, href, \{ phase: "location" \}\)\) return;/,
  "frame navigation must update the saved current URL"
);
assert.match(
  frame,
  /state\.fullscreenGroupId = state\.fullscreenGroupId === groupId \? null : groupId;\s*rememberWorkspaceSession\(\);/,
  "fullscreen changes must be remembered"
);
assert.match(
  pocket,
  /state\.temporaryLayoutPreset = \{[\s\S]*?state\.groups = groups;\s*state\.activeTabs = activeTabs;\s*rememberWorkspaceSession\(\);/,
  "temporary Pocket workspaces must be remembered before rendering"
);
assert.match(
  pocket,
  /loadPocketEntryInFrame[\s\S]*?restorableChatFrameHref\(app, sourceHref\)/,
  "a Pocket entry must sanitize an unsafe built-in Notion route before frame assignment"
);
assert.match(
  pocket,
  /pocketRestoreSources[\s\S]*?restorableChatFrameHref\(app, sourceHref\)/,
  "a restored Pocket workspace must sanitize an unsafe built-in Notion route before staging initialHref"
);
for (const [owner, source] of Object.entries({ layout, frame, pocket })) {
  assert.match(
    source,
    /requireMethods\(session, "session", \[[^\]]*"rememberWorkspaceSession"/,
    `${owner} mutations must depend on the owned workspace-session port`
  );
}
for (const factory of [
  "createWorkspaceLayoutController",
  "createWorkspaceFrameController",
  "createWorkspacePocketController"
]) {
  assert.match(
    workspace,
    new RegExp(`const \\w+ = ${factory}\\(\\{[\\s\\S]*?session: sessionBinding\\.port,`),
    `${factory} must receive the single bound session owner`
  );
}

console.log("workspace session bootstrap and mutation integration: ok");
