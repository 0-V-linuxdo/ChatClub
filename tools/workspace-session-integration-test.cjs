#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const runtime = read("app/runtime.js");
const workspace = read("app/workspace/controller.js");
const session = read("app/workspace/session-controller.js");
const layout = read("app/workspace/layout-controller.js");
const frame = read("app/workspace/frame-controller.js");
const pocket = read("app/workspace/pocket-controller.js");

const initStart = runtime.indexOf("async function init()");
const initEnd = runtime.indexOf("\n}\n\ninit().catch", initStart);
const init = runtime.slice(initStart, initEnd);
const loadIndex = init.indexOf("workspaceSessionStore.load()");
const hydrateIndex = init.indexOf("workspaceController.hydrateGroups(promptHandoffLaunch.snapshot || workspaceSessionSnapshot)");
const renderIndex = init.lastIndexOf("\n  render();");
const restoreBarrierIndex = init.indexOf("waitForInitialWorkspaceFrameRestoration()");
const preferredModelIndex = init.indexOf("applyPreferredModelsToFrames(null, { immediate: false })");

assert.ok(initStart >= 0 && initEnd > initStart, "app init must remain discoverable");
assert.ok(loadIndex >= 0, "workspace snapshot must start loading during bootstrap");
assert.ok(hydrateIndex > loadIndex, "workspace snapshot must load before hydration");
assert.ok(renderIndex > hydrateIndex, "restored hydration must finish before the first app render");
assert.ok(restoreBarrierIndex > renderIndex, "the initial workspace must render before the restoration barrier starts");
assert.ok(preferredModelIndex > restoreBarrierIndex, "preferred models must wait for initial frame restoration");
assert.match(runtime, /function initialWorkspaceFrameRestoreState\(\)/);
assert.match(runtime, /function waitForInitialWorkspaceFrameRestoration\(/);
assert.match(runtime, /createWorkspaceSessionStore\(\{[\s\S]*?currentTab: currentExtensionTab[\s\S]*?currentTabId: currentExtensionTabId[\s\S]*?storageGet[\s\S]*?storageSet[\s\S]*?storageRemove[\s\S]*?\}\)/);
assert.match(runtime, /action: "claimWorkspaceSessionRecovery"/, "a naked replacement page must claim before default hydration");
assert.match(runtime, /workspaceClearedTabsController\.refresh\(\)/, "cleared ChatClub tabs must be listed after hydration");
assert.match(runtime, /workspaceClearedTabsController\.syncBanner\(shell\)/, "the one-click restore banner must render with the workspace");
assert.match(
  runtime,
  /initializeTopbarPromptPlaceholder\(\{\s*persist:\s*!workspaceSessionSnapshot\s*\}\)/,
  "a restored workspace page must not persist a competing topbar placeholder write during init"
);
assert.doesNotMatch(runtime, /absorbIntoCurrent/, "restore must open a new browser tab for every cleared ChatClub page");
assert.match(runtime, /action: "commitWorkspaceSessionRecovery"[\s\S]*?workspaceId,[\s\S]*?claimId/, "a restored claim must commit by workspace and claim ids");
assert.match(runtime, /workspaceSessionStore,\s*\n\s*framePort:/, "the workspace controller must receive the per-page store");

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
