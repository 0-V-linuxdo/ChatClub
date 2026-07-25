#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vm = require("node:vm");

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

  assert.match(
    composer,
    /import\s*\{\s*createFrameSendQueue\s*\}\s*from\s*"\.\/frame-send-queue\.js"/,
    "Composer must use the independently tested per-frame queue coordinator"
  );
  assert.match(
    composer,
    /const frameSendQueue = createFrameSendQueue\(\{[\s\S]*execute:\s*executeQueuedFrameSend[\s\S]*isUncertainError:\s*frameSendDeliveryIsUncertain/,
    "Composer must bind dequeued sends and uncertain-delivery handling to the per-frame queue"
  );
  const sendText = functionSource(composer, "sendTextToFrame");
  assert.equal((sendText.match(/framePort\.request\(/g) || []).length, 1, "one dequeued Composer send must map to at most one Frame RPC request");
  assert.match(sendText, /expectedDocumentId:\s*readiness\.documentId/, "a dequeued send must remain bound to its readiness document");
  assert.doesNotMatch(sendText, /scheduleContentFrameRepair|prepareContentFrameRuntime/, "Composer must not repair and replay an ambiguously delivered send");
  const executeQueuedSend = functionSource(composer, "executeQueuedFrameSend");
  assert.equal((executeQueuedSend.match(/sendTextToFrame\(/g) || []).length, 1, "each queue execution must invoke the single-attempt sender once");
  assert.match(executeQueuedSend, /waitForPreferredModelSubmissionBarrier\(/, "same-frame FIFO must include the submission navigation barrier");
  const sendAll = functionSource(composer, "sendPromptToFrames");
  assert.match(sendAll, /frameSendQueue\.enqueue\(iframe,\s*\{/, "each admitted iframe must receive its own frozen queue job");
  assert.match(sendAll, /entries\.some\(\(entry\) => entry\.admitted\)/, "Composer must distinguish queue admission from immediate target skips");
  assert.match(sendAll, /recordSendHistory\(text, images\)[\s\S]*clearInput\(\)[\s\S]*settlePromptSubmission\(entries, settlement\)/, "Composer must save and clear the admitted snapshot before asynchronous settlement");
  assert.ok(
    sendAll.indexOf("clearInput()") < sendAll.lastIndexOf("settlePromptSubmission(entries, settlement)"),
    "a completed S1 must never perform the clear that could erase an already-entered S2"
  );
  assert.doesNotMatch(composer, /promptSendInFlight/, "Composer must allow repeated submissions while earlier jobs remain queued");
  assert.doesNotMatch(
    composer,
    /ensurePreferredModelInputReady|preferredModelInputGateIsLocked|handleBeforeInput|\.readOnly\b|["']aria-busy["']/,
    "model preparation must never gate Composer editing, IME, paste, attachments, or submit admission"
  );
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
  assert.doesNotMatch(preferredModel, /\bcomposer\s*:\s*"object"/, "Preferred Model readiness must not depend on the Composer controller");
  assert.doesNotMatch(preferredModel, /const controller = workspace\(\)/, "Preferred Model must not dereference a provider thunk");
  const readinessSource = functionSource(preferredModel, "preferredModelFrameReadiness");
  assert.ok(
    readinessSource.indexOf("preferredModelFrameIsLoading(iframe)") < readinessSource.indexOf("if (!payload)"),
    "iframe loading must take precedence over an unconfigured model preference"
  );
  assert.ok(
    readinessSource.indexOf("record?.key === frameKey && record.terminal") < readinessSource.indexOf("preferredModelFrameIsLoading(iframe)"),
    "a terminal current model run must not remain masked by a stale loading marker"
  );
  const readinessIframe = {
    isConnected: true,
    dataset: {
      instanceId: "notion-frame",
      preferredModelDocumentId: "document-current",
      preferredModelContentBridgeVersion: "bridge-current"
    }
  };
  const readinessRecord = {
    key: "NotionAI:gemini31pro:document-current",
    runId: "run-terminal",
    terminal: true,
    success: false,
    cancelled: false,
    failureReason: "bridge unavailable"
  };
  const readinessContext = vm.createContext({ readinessIframe, readinessRecord });
  vm.runInContext(`
    const preferredModelApplyRuns = new Map([[readinessIframe, readinessRecord]]);
    function activeWorkspace() { return { frameApp: () => ({ id: "NotionAI" }) }; }
    function preferredModelPayloadForApp() { return { appId: "NotionAI", modelId: "gemini31pro" }; }
    function preferredModelAppId() { return "NotionAI"; }
    function preferredModelFrameKey() { return readinessRecord.key; }
    function preferredModelFrameIsLoading() { return true; }
    function t() { return "fallback"; }
    ${readinessSource}
    globalThis.readinessResult = preferredModelFrameReadiness(readinessIframe);
  `, readinessContext);
  assert.equal(
    readinessContext.readinessResult.state,
    "failed",
    "a terminal current model failure must wake queued sends even if loading cleanup was missed"
  );
  const gateSource = functionSource(preferredModel, "preferredModelGateStatus");
  assert.doesNotMatch(
    gateSource,
    /preferredModelFrameIsLoading/,
    "the global model status must share per-frame readiness precedence"
  );
  const gateContext = vm.createContext({});
  vm.runInContext(`
    let preferredModelGateBootstrapping = false;
    function preferredModelConfiguredActiveFrames() {
      return [{ iframe: {}, payload: { appId: "NotionAI" } }];
    }
    function preferredModelFrameReadiness() {
      return { state: "failed", reason: "bridge unavailable" };
    }
    function t() { return "fallback"; }
    ${gateSource}
    globalThis.gateResult = preferredModelGateStatus();
  `, gateContext);
  assert.deepEqual(
    JSON.parse(JSON.stringify(gateContext.gateResult)),
    {
      state: "failed",
      reason: "bridge unavailable",
      pendingCount: 0,
      failedCount: 1,
      failedAppIds: ["NotionAI"]
    },
    "global Composer status must expose the same terminal frame failure"
  );
  for (const method of [
    "preferredModelFrameReadiness",
    "preferredModelFrameReadinessIsCurrent",
    "waitForPreferredModelFrame",
    "waitForPreferredModelSubmissionBarrier"
  ]) {
    assert.match(preferredModel, new RegExp(`function ${method}\\(`), `Preferred Model must implement ${method}()`);
    assert.match(
      preferredModel,
      new RegExp(`return Object\\.freeze\\(\\{[\\s\\S]*\\b${method}\\b[\\s\\S]*\\}\\);`),
      `Preferred Model must export ${method}() through its controller port`
    );
  }

  console.log("Composer/Topbar controller boundaries: ok");
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
