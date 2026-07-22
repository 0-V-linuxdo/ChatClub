#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const runtime = read("app/runtime.js");
const composer = read("app/composer/controller.js");
const topbar = read("app/topbar/controller.js");
const topbarView = read("app/topbar/view.js");
const preferredModel = read("app/preferred-model/controller.js");

const { functionSource } = require("./function-source.cjs");

(async () => {
  const portModule = await import(pathToFileURL(path.join(root, "app/controller-port.js")).href);
  const binding = portModule.createBindOnceControllerPort("Boundary Test", ["read", "write"]);
  assert.throws(() => binding.port.read(), /not bound/, "a stable port must fail closed before bootstrap binding");
  assert.throws(
    () => binding.bind({ read() {} }),
    /requires write\(\)/,
    "binding must reject an incomplete capability target"
  );
  const target = { read: () => 7, write: (value) => value + 1 };
  const stablePort = binding.port;
  assert.equal(binding.bind(target), stablePort, "binding must retain the stable port identity");
  assert.equal(stablePort.read(), 7);
  assert.equal(stablePort.write(4), 5);
  assert.throws(() => binding.bind(target), /already bound/, "a port must never be rebound to a later controller");

  assert.match(runtime, /createComposerController\(/, "runtime must compose the extracted Composer owner");
  assert.match(runtime, /createTopbarController\(/, "runtime must compose the extracted Topbar owner");
  assert.match(runtime, /workspaceBinding\.bind\(workspaceController\)/, "runtime must bind the stable workspace port once");
  assert.match(runtime, /topbarBinding\.bind\(topbarController\)/, "runtime must bind the stable topbar port once");
  assert.doesNotMatch(runtime, /workspace:\s*\(\)\s*=>\s*workspaceController/, "runtime must not expose an uninitialized workspace controller through a provider thunk");
  assert.doesNotMatch(runtime, /=>\s*preferredModelController\./, "runtime must not expose an uninitialized Preferred Model controller through provider thunks");
  assert.ok(runtime.split(/\r?\n/).length < 1200, "runtime must stay an assembly root after Composer/Topbar extraction");

  const sendText = functionSource(composer, "sendTextToFrame");
  assert.equal((sendText.match(/framePort\.request\(/g) || []).length, 1, "one Composer send attempt must map to one Frame RPC request");
  assert.doesNotMatch(sendText, /scheduleContentFrameRepair|prepareContentFrameRuntime/, "Composer must not repair and replay an ambiguously delivered send");
  const sendAll = functionSource(composer, "sendPromptToFrames");
  assert.match(sendAll, /state\.promptSendInFlight = true/, "Composer must own the send-in-flight transition");
  assert.match(sendAll, /finally\s*\{[\s\S]*state\.promptSendInFlight = false/, "Composer must release its send lock on every outcome");
  assert.match(functionSource(composer, "handleInputKeydown"), /promptHistoryNavigate\(/, "Composer must own prompt-history navigation");
  const promptMenu = functionSource(composer, "openActionsMenu");
  assert.match(promptMenu, /topbar\.closeSettingsMenu\(\)/, "Prompt Actions must dismiss only the Topbar menu owner");
  assert.match(promptMenu, /workspace\.closePopovers\(\)/, "Prompt Actions must dismiss the workspace popover owner through its port");
  assert.match(functionSource(composer, "closeActionsMenuOnKeydown"), /claimTopmostPopoverEscape\(event,\s*"\.prompt-actions-popover"\)/, "Prompt Actions must claim only its topmost Escape");

  const topbarSync = functionSource(topbar, "sync");
  assert.match(topbarSync, /composer\.closeActionsMenu\(\)/, "Topbar redraw must close the Composer-owned popover before anchor replacement");
  assert.match(topbarSync, /workspace\.closePopoversAnchoredWithin\(node\)/, "Topbar redraw must close only workspace popovers anchored in the replaced node");
  assert.match(topbarSync, /preferredModel\.syncPreferredModelInputGate\(\)/, "Topbar redraw must preserve the Preferred Model gate state");
  assert.match(functionSource(topbar, "saveEditLayout"), /editSavePending = true[\s\S]*finally[\s\S]*editSavePending = false/, "Topbar must guard every edit-save close path while persistence is pending");
  assert.match(functionSource(topbar, "closeSettingsMenuOnKeydown"), /claimTopmostPopoverEscape\(event,\s*"\.topbar-settings-popover"\)/, "Topbar Settings must claim only its topmost Escape");
  const brandMenuAction = functionSource(topbar, "runMenuItem");
  assert.match(brandMenuAction, /item\.id === "brand"[\s\S]*actions\.openNewWorkspaceTab\(\)/, "a folded Logo item must open a fresh ChatClub tab");
  assert.doesNotMatch(brandMenuAction, /item\.id === "brand"[\s\S]{0,160}openSettings\("about"\)/, "a folded Logo item must no longer open About");
  assert.match(topbarView, /function render\(/, "Topbar view must own normal and edit-mode rendering");
  assert.match(topbarView, /function renderSettingsMenu\(/, "Topbar view must own Settings menu rendering");
  assert.doesNotMatch(topbarView, /addEventListener\("keydown"/, "the view must not own dismissal listeners");
  const brandView = functionSource(topbarView, "renderBrand");
  assert.match(brandView, /t\("common\.openInNewTab"\)/, "the Logo must announce its new-tab behavior");
  assert.match(brandView, /actions\.openNewWorkspaceTab\(\)/, "the visible Logo must open a fresh ChatClub tab");
  assert.doesNotMatch(brandView, /openSettings\("about"\)/, "the visible Logo must no longer open About");

  assert.match(preferredModel, /workspace:\s*"object"/, "Preferred Model must consume a stable workspace port");
  assert.match(preferredModel, /composer:\s*"object"/, "Preferred Model must consume the initialized Composer port");
  assert.doesNotMatch(preferredModel, /const controller = workspace\(\)/, "Preferred Model must not dereference a provider thunk");

  console.log("Composer/Topbar controller boundaries: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
