#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const runtime = read("app/runtime.js");
const workspace = read("app/workspace/controller.js");

const initStart = runtime.indexOf("async function init()");
const initEnd = runtime.indexOf("\n}\n\ninit().catch", initStart);
const init = runtime.slice(initStart, initEnd);
const loadIndex = init.indexOf("workspaceSessionStore.load()");
const hydrateIndex = init.indexOf("workspaceController.hydrateGroups(workspaceSessionSnapshot)");
const renderIndex = init.lastIndexOf("\n  render();");

assert.ok(initStart >= 0 && initEnd > initStart, "app init must remain discoverable");
assert.ok(loadIndex >= 0, "workspace snapshot must start loading during bootstrap");
assert.ok(hydrateIndex > loadIndex, "workspace snapshot must load before hydration");
assert.ok(renderIndex > hydrateIndex, "restored hydration must finish before the first app render");
assert.match(runtime, /createWorkspaceSessionStore\(\{[\s\S]*?currentTab: currentExtensionTab[\s\S]*?currentTabId: currentExtensionTabId[\s\S]*?storageGet[\s\S]*?storageSet[\s\S]*?storageRemove[\s\S]*?\}\)/);
assert.match(runtime, /action: "claimWorkspaceSessionRecovery"/, "a naked replacement page must claim before default hydration");
assert.match(runtime, /action: "commitWorkspaceSessionRecovery"[\s\S]*?workspaceId,[\s\S]*?claimId/, "a restored claim must commit by workspace and claim ids");
assert.match(runtime, /workspaceSessionStore,\s*\n\s*framePort:/, "the workspace controller must receive the per-page store");

assert.match(
  workspace,
  /function hydrateGroups\(snapshot = null\) \{\s*if \(restoreWorkspaceSession\(snapshot\)\) \{\s*rememberWorkspaceSession\(\);\s*return true;/,
  "restored state must be captured before ordinary default hydration can run"
);
assert.match(workspace, /generation: workspaceSessionStore\.generation\(\)/);
assert.match(workspace, /currentHrefForTab: \(chat\) => currentHrefForWorkspaceTab\(chat, framesByInstanceId\)/);
assert.match(workspace, /workspaceSessionStore\.save\(snapshot\)/);
assert.match(
  workspace,
  /state\.activeTabs\[group\.id\] = instanceId;\s*rememberWorkspaceSession\(\);/,
  "selecting an internal tab must synchronously update the page snapshot"
);
assert.match(
  workspace,
  /if \(hrefChanged\) rememberWorkspaceSession\(\);/,
  "frame navigation must update the saved current URL"
);
assert.match(
  workspace,
  /state\.fullscreenGroupId = state\.fullscreenGroupId === groupId \? null : groupId;\s*rememberWorkspaceSession\(\);/,
  "fullscreen changes must be remembered"
);
assert.match(
  workspace,
  /state\.temporaryLayoutPreset = \{[\s\S]*?state\.groups = groups;\s*state\.activeTabs = activeTabs;\s*rememberWorkspaceSession\(\);/,
  "temporary Pocket workspaces must be remembered before rendering"
);
assert.ok(
  (workspace.match(/rememberWorkspaceSession\(\);/g) || []).length >= 12,
  "workspace structural, navigation, selection, and fullscreen paths must share one persistence hook"
);

console.log("workspace session bootstrap and mutation integration: ok");
